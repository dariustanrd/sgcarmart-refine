// ==UserScript==
// @name         Sgcarmart Refine Results
// @namespace    sgcarmart-refine
// @version      0.7.0
// @description  Filter Sgcarmart's used-car listings and hide promotional blocks.
// @match        https://www.sgcarmart.com/used-cars/listing*
// @run-at       document-idle
// @inject-into  content
// @require      https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js#sha256=fknaaFiOJQ27i7oZDSyqirN4fMAoS9odiy+AXE33Qsk=
// @grant        GM_xmlhttpRequest
// @connect      i.i-sgcm.com
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const LISTING_PATH = /^\/used-cars\/listing(?:\/|$)/;
  if (!LISTING_PATH.test(location.pathname)) return;

  const BAR_ID = 'sgcarmart-refine-results';
  if (document.getElementById(BAR_ID)) return;

  let pageSizeRedirect;
  function ensurePageSize() {
    const url = new URL(location.href);
    if (url.searchParams.get('limit') === '100') {
      pageSizeRedirect = undefined;
      return true;
    }
    url.searchParams.set('limit', '100');
    url.searchParams.delete('page');
    if (pageSizeRedirect !== url.href) {
      pageSizeRedirect = url.href;
      location.replace(url.href);
    }
    return false;
  }
  if (!ensurePageSize()) return;

  const STORAGE_KEY = 'sgcarmart-refine:v1';
  const HIDDEN = 'data-sgcarmart-refine-hidden';
  const HIDE_PROMOS = 'data-sgcarmart-refine-hide-promos';
  const HANDY_ORIGINAL = 'data-sgcarmart-refine-handy-original';
  const HANDY_COPY_ID = 'sgcarmart-refine-handy-tools';
  // Match the stable parts of Sgcarmart's CSS module names, without the build hashes.
  const CARD = '[class^="styles_listing_box__"], [class*=" styles_listing_box__"]';
  const TITLE = [
    '[class^="listing_make_model_box__"]', '[class*=" listing_make_model_box__"]',
    '[class^="styles_top_content__"]', '[class*=" styles_top_content__"]',
  ].join(', ');
  const DETAIL_LINK = 'a[href*="/used-cars/info/"]';
  const HEADER = '#listing_search_grey_header';

  function normalize(value) {
    return value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  function terms(value) {
    return value.split(/[,;]+/).map(normalize).filter(Boolean);
  }

  function matches(title, include, exclude) {
    const words = ` ${normalize(title)} `;
    const has = phrase => words.includes(` ${phrase} `);
    return (!include.length || include.some(has)) && !exclude.some(has);
  }

  function readPreferences() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  const preferences = readPreferences();
  const bar = document.createElement('div');
  bar.id = BAR_ID;
  const shadow = bar.attachShadow({ mode: 'open' });

  const listingStyles = new CSSStyleSheet();
  listingStyles.replaceSync(`
    [${HIDDEN}], [${HANDY_ORIGINAL}],
    [${HIDE_PROMOS}] main > [class^="listing_gam_container__"],
    [${HIDE_PROMOS}] main #teadsads-placement-listing,
    [${HIDE_PROMOS}] main #listing_interstitial_banner,
    [${HIDE_PROMOS}] main [class^="listing_listing_container__"] > div:has(
      > :is([class^="styles_starads_box__"], [class^="styles_featuredDealerBox__"])
    ) { display: none !important; }
    #${HANDY_COPY_ID} {
      box-sizing: border-box;
      inline-size: 100%;
      max-inline-size: 100%;
      min-inline-size: 0;
      margin: 0 0 16px;
      overflow-x: auto;
    }
  `);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, listingStyles];

  const panelStyles = new CSSStyleSheet();
  panelStyles.replaceSync(`
    :host { display: block; margin-block: 12px; color-scheme: light dark; }
    section { box-sizing: border-box; font: 14px/1.4 system-ui, sans-serif;
      color: CanvasText; background: Canvas; border: 1px solid color-mix(in srgb, CanvasText 22%, Canvas);
      border-radius: 8px; padding: 12px 14px; }
    header { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; }
    h2 { margin: 0; font-size: 15px; }
    p { margin: 0; }
    .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
      gap: 8px 12px; margin-block: 10px 8px; }
    label { display: grid; gap: 3px; font-weight: 600; }
    input, button { box-sizing: border-box; font: inherit; }
    input[type="text"] { width: 100%; min-width: 0; padding: 6px 8px; border: 1px solid GrayText;
      border-radius: 5px; color: FieldText; background: Field; font-weight: 400; }
    footer { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; }
    .toggle { display: inline-flex; align-items: center; gap: 6px; font-weight: 400; }
    .toggle input { margin: 0; }
    button { padding: 3px 9px; border: 1px solid GrayText; border-radius: 5px;
      background: ButtonFace; color: ButtonText; cursor: pointer; }
    [data-export-status]:not([hidden]) { margin-top: 8px; }
  `);
  shadow.adoptedStyleSheets = [panelStyles];
  shadow.innerHTML = `
    <section aria-labelledby="refine-heading">
      <header>
        <h2 id="refine-heading">Refine results</h2>
        <p role="status"></p>
      </header>
      <div class="fields">
        <label>Include any <input type="text" data-kind="include" aria-describedby="refine-help"
          placeholder="Toyota Corolla Altis, Mazda 3" autocomplete="off"></label>
        <label>Exclude any <input type="text" data-kind="exclude" aria-describedby="refine-help"
          placeholder="Axio, Mild Hybrid" autocomplete="off"></label>
      </div>
      <footer>
        <button type="button">Clear</button>
        <button type="button" data-export disabled>Export to Excel</button>
        <label class="toggle"><input type="checkbox" data-kind="hide-promos"> Hide promotional blocks</label>
        <label class="toggle"><input type="checkbox" data-kind="move-handy"> Move Handy Tools below filters</label>
        <p id="refine-help">Separate title phrases with commas. Exclusions win.</p>
      </footer>
      <p data-export-status role="status" hidden></p>
    </section>
  `;

  const includeInput = shadow.querySelector('[data-kind="include"]');
  const excludeInput = shadow.querySelector('[data-kind="exclude"]');
  const hidePromosInput = shadow.querySelector('[data-kind="hide-promos"]');
  const moveHandyInput = shadow.querySelector('[data-kind="move-handy"]');
  const status = shadow.querySelector('[role="status"]');
  const exportButton = shadow.querySelector('[data-export]');
  const exportStatus = shadow.querySelector('[data-export-status]');
  includeInput.value = typeof preferences.include === 'string' ? preferences.include : '';
  excludeInput.value = typeof preferences.exclude === 'string' ? preferences.exclude : '';
  hidePromosInput.checked = preferences.hidePromos !== false;
  moveHandyInput.checked = preferences.moveHandy !== false;

  let handyOriginal;
  let handyCopy;

  function restoreHandyTools() {
    handyOriginal?.removeAttribute(HANDY_ORIGINAL);
    handyCopy?.remove();
    handyOriginal = handyCopy = undefined;
  }

  function placeHandyTools(header) {
    if (!moveHandyInput.checked) {
      restoreHandyTools();
      return;
    }

    const siblings = [...header.parentElement.children];
    const row = siblings.find(block =>
      block.id !== HANDY_COPY_ID && !/^listing_\d+$/.test(block.id) &&
      !block.matches(CARD) && !block.querySelector(CARD) &&
      block.querySelector('a[href*="/used-cars/depreciation-ca"]') &&
      [...block.querySelectorAll('*')].some(
        label => label.textContent.trim() === 'Handy Tools',
      ),
    );
    if (!row) {
      restoreHandyTools();
      return;
    }

    // Keep the site-owned row in its original position for Sgcarmart's rerenders.
    if (row !== handyOriginal) {
      restoreHandyTools();
      handyCopy = row.cloneNode(true);
      handyCopy.id = HANDY_COPY_ID;
      handyCopy.removeAttribute(HANDY_ORIGINAL);
      for (const child of handyCopy.querySelectorAll('[id]')) child.removeAttribute('id');
      handyOriginal = row;
    }
    const heading = siblings.find(block => block.matches('[class^="styles_indicator_container__"]'));
    const anchor = heading || bar;
    if (anchor.previousElementSibling !== handyCopy) anchor.before(handyCopy);
    row.setAttribute(HANDY_ORIGINAL, '');
  }

  function refresh() {
    const header = LISTING_PATH.test(location.pathname) &&
      [...document.querySelectorAll(HEADER)].find(el => el.getClientRects().length);
    document.documentElement.toggleAttribute(HIDE_PROMOS, Boolean(header) && hidePromosInput.checked);
    if (!header) {
      restoreHandyTools();
      bar.remove();
      for (const card of document.querySelectorAll(`[${HIDDEN}]`)) card.removeAttribute(HIDDEN);
      return;
    }
    if (!ensurePageSize()) return;
    if (header.previousElementSibling !== bar) header.before(bar);
    placeHandyTools(header);

    const include = terms(includeInput.value);
    const exclude = terms(excludeInput.value);
    const seen = new Map();
    for (const card of document.querySelectorAll(`main :is(${CARD})`)) {
      const link = card.querySelector(`:is(${TITLE}) ${DETAIL_LINK}`);
      const title = link?.textContent.trim();
      const href = link?.getAttribute('href');
      // Leave unrecognised cards alone rather than hiding potential matches.
      if (!title || !href) {
        card.removeAttribute(HIDDEN);
        continue;
      }
      const visible = matches(title, include, exclude);
      card.toggleAttribute(HIDDEN, !visible);
      const key = href.split(/[?#]/, 1)[0].replace(/\/$/, '');
      seen.set(key, Boolean(seen.get(key) || visible));
    }

    const shown = [...seen.values()].filter(Boolean).length;
    const message = seen.size
      ? `${shown} of ${seen.size} listing${seen.size === 1 ? '' : 's'} shown on this page.`
      : 'No listing titles found on this page.';
    if (status.textContent !== message) status.textContent = message;
    if (exportButton.dataset.busy !== 'true') exportButton.disabled = !seen.size;
  }

  // Read the search response already used by the listing page without executing it.
  // Pagination stays on the public listing URL and uses the same search parameters.
  function readSearchPage(html) {
    const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)];
    const records = new Map();
    for (const line of chunks.map(([, json]) => JSON.parse(json)).join('').split('\n')) {
      const record = /^([\da-f]+):([\[{"\d-].*)$/i.exec(line);
      if (!record) continue;
      try {
        records.set(record[1], JSON.parse(record[2]));
      } catch {
        // Other record types are unrelated to the listing payload.
      }
    }
    function resolve(value) {
      if (value === '$undefined') return null;
      if (typeof value === 'string' && value.startsWith('$$')) return value.slice(1);
      if (typeof value === 'string' && /^\$[\da-f]+$/i.test(value)) {
        return records.get(value.slice(1)) ?? null;
      }
      return value;
    }
    const props = [...records.values()].find(value => value && Object.hasOwn(value, 'listing_data'));
    const data = resolve(props?.listing_data);
    const cars = resolve(data?.data);
    const meta = resolve(data?.meta);
    if (!Array.isArray(cars) || !Number.isInteger(meta?.last_page) ||
        !Number.isInteger(meta?.current_page) || meta.last_page < 1) {
      throw new Error('Sgcarmart did not return a readable result page.');
    }
    const listings = cars.map(resolve);
    if (listings.some(car => !car?.id || !car.car_model || !car.link)) {
      throw new Error('Sgcarmart returned an incomplete result page.');
    }
    return { listings, meta, resolve };
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function excelDate(value) {
    const date = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value || '');
    const month = date ? MONTHS.indexOf(date[2]) : -1;
    return month >= 0 ? new Date(Date.UTC(Number(date[3]), month, Number(date[1]))) : value || null;
  }

  function quantity(value) {
    const match = /^([\d,]+)(?:\.\d+)?(?:\s|$)/.exec(String(value ?? '').trim());
    if (!match) return null;
    const number = Number(match[0].trim().replaceAll(',', ''));
    return Number.isFinite(number) ? number : null;
  }

  function coeMonths(value) {
    const years = /(\d+)\s*y/i.exec(value || '');
    const months = /(\d+)\s*m/i.exec(value || '');
    return years || months ? Number(years?.[1] || 0) * 12 + Number(months?.[1] || 0) : null;
  }

  function webLink(value) {
    if (typeof value !== 'string' || !value) return null;
    try {
      const url = new URL(value, location.origin);
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }

  function listingRow(car, resolve) {
    const value = key => resolve(car[key]);
    const dealer = value('dealer_lead');
    const instalment = value('instalment');
    const extra = value('additional_statuses');
    const deals = resolve(value('deals')?.super_deal);
    const labels = list => (Array.isArray(list) ? list : [])
      .map(resolve).map(item => typeof item === 'string' ? item : item?.label || item?.name || item?.title)
      .filter(Boolean).join('; ') || null;
    const photoUrl = webLink(value('image'));
    const listingUrl = webLink(value('link'));
    const warranty = value('warranty');
    return {
      title: value('car_model'), make: value('make'), model: value('model'), price: quantity(value('price')),
      depreciation: quantity(value('depreciation')), instalment: quantity(instalment?.installment),
      registration: excelDate(value('registration_date')), coe: value('coeLeft'),
      coeMonths: coeMonths(value('coeLeft')), mileage: quantity(value('mileage')),
      engine: quantity(value('engine_capacity')), driveRange: quantity(value('drive_range')),
      owners: quantity(value('owners')), fuel: value('fuel_type'), transmission: value('transmission'),
      type: value('type'), dealer: dealer?.name || null, dealerCode: value('dealer_code'),
      posted: excelDate(value('date')), firstRegistration: excelDate(value('first_registration_date')),
      scheme: value('vehicle_scheme'), category: value('category'), ad: value('tag'),
      status: value('sale_status') || (value('status') === 'a' ? 'Available' : value('status')),
      auctionClose: value('auction_closing_time'), grade: value('inspection_grade') || value('sta_grade'),
      warranty: typeof warranty === 'string' ? warranty : warranty?.label || warranty?.description || null,
      imported: extra?.is_imported_used, parf: extra?.is_eligible_for_parf_rebate,
      coe10: extra?.has_10_years_coe, buySafe: value('buysafe')?.is_buysafe,
      starAd: value('star_ad')?.is_star_ad, spotlight: value('spotlight')?.is_spotlight,
      maxLtv: quantity(instalment?.max_ltv_ratio), deal: labels(deals), promotions: labels(value('promo_labels')),
      description: value('description'), id: car.id,
      listing: listingUrl && { text: 'Open listing', hyperlink: listingUrl },
      similar: webLink(value('view_similar_link')), photoUrl,
    };
  }

  async function collectSearch(url, include, exclude, update) {
    const rows = new Map();
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
      update('Reading result page ' + page + (page > 1 ? ' of ' + pages : '') + '…');
      url.searchParams.set('limit', '100');
      if (page === 1) url.searchParams.delete('page');
      else url.searchParams.set('page', String(page));
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Could not read result page ' + page + ' (HTTP ' + response.status + ').');
      const { listings, meta, resolve } = readSearchPage(await response.text());
      if (meta.current_page !== page) throw new Error('Sgcarmart returned the wrong result page.');
      if (page === 1) pages = meta.last_page;
      for (const car of listings) {
        if (!rows.has(car.id) && matches(car.car_model, include, exclude)) {
          rows.set(car.id, listingRow(car, resolve));
        }
      }
    }
    return [...rows.values()];
  }

  async function thumbnail(url) {
    if (!url || new URL(url).hostname !== 'i.i-sgcm.com') return null;
    try {
      const bytes = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET', url, anonymous: true, responseType: 'arraybuffer', timeout: 12000,
          onload: response => response.status === 200 ? resolve(response.response) : reject(),
          onerror: reject, ontimeout: reject, onabort: reject,
        });
      });
      const bitmap = await createImageBitmap(new Blob([bytes]));
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 96;
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
        const width = bitmap.width * scale;
        const height = bitmap.height * scale;
        context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        return canvas.toDataURL('image/jpeg', 0.82);
      } finally {
        bitmap.close();
      }
    } catch {
      return null;
    }
  }

  async function exportWorkbook(rows, update) {
    const workbook = new window.ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Listings', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
    const number = '#,##0';
    const money = '"S$"#,##0';
    const date = 'dd-mmm-yyyy';
    const columns = [
      ['photo', 'Photo', 24], ['title', 'Listing title', 39], ['listing', 'Listing link', 17],
      ['make', 'Make', 16], ['model', 'Model', 18],
      ['price', 'Price (SGD)', 16, money], ['depreciation', 'Depreciation / yr', 21, money],
      ['instalment', 'Instalment / mo', 20, money], ['registration', 'Registration date', 20, date],
      ['coe', 'COE left', 14], ['coeMonths', 'COE left (months)', 22, number],
      ['mileage', 'Mileage (km)', 16, number], ['engine', 'Engine (cc)', 15, number],
      ['driveRange', 'Drive range (km)', 20, number], ['owners', 'Owners', 12, number],
      ['fuel', 'Fuel', 16], ['transmission', 'Transmission', 17], ['type', 'Body type', 17],
      ['dealer', 'Dealer', 30], ['posted', 'Posted date', 17, date],
      ['firstRegistration', 'First registration', 21, date], ['scheme', 'Vehicle scheme', 19],
      ['category', 'Category', 17], ['ad', 'Ad label', 17], ['status', 'Sale status', 16],
      ['auctionClose', 'Auction closes', 21], ['grade', 'Inspection grade', 20],
      ['warranty', 'Warranty', 22], ['imported', 'Imported used', 18],
      ['parf', 'PARF eligible', 17], ['coe10', '10-year COE', 16], ['buySafe', 'BuySafe', 13],
      ['starAd', 'Star Ad', 12], ['spotlight', 'Spotlight', 14], ['maxLtv', 'Max LTV (%)', 16],
      ['deal', 'Deal labels', 23], ['promotions', 'Promotions', 25], ['description', 'Description', 70],
      ['id', 'Listing ID', 14], ['dealerCode', 'Dealer code', 15],
      ['similar', 'Similar listings URL', 26], ['photoUrl', 'Photo URL', 24],
    ];
    sheet.columns = columns.map(([key, header, width, numFmt]) => ({
      key, header, width, ...(numFmt && { style: { numFmt } }),
    }));
    sheet.getRow(1).height = 24;
    sheet.getRow(1).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF263A52' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle' };
    });
    for (const data of rows) {
      const row = sheet.addRow(data);
      row.height = 78;
      row.alignment = { vertical: 'middle', wrapText: true };
      if (row.number % 2 === 0) {
        row.eachCell({ includeEmpty: true }, cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F6FA' } };
        });
      }
      row.getCell('listing').font = { color: { argb: 'FF145CA8' }, underline: true };
    }
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: columns.length } };
    let cursor = 0;
    let done = 0;
    let missing = 0;
    update('Preparing photos (0 of ' + rows.length + ')…');
    await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
      while (cursor < rows.length) {
        const index = cursor++;
        const photo = await thumbnail(rows[index].photoUrl);
        if (photo) {
          const id = workbook.addImage({ base64: photo, extension: 'jpeg' });
          // Use explicit offsets (9,525 EMU per pixel) within the photo cell.
          sheet.addImage(id, {
            tl: { nativeCol: 0, nativeColOff: 5 * 9525, nativeRow: index + 1, nativeRowOff: 4 * 9525 },
            br: { nativeCol: 0, nativeColOff: 165 * 9525, nativeRow: index + 1, nativeRowOff: 100 * 9525 },
            editAs: 'twoCell',
          });
        } else {
          missing++;
          sheet.getCell('A' + (index + 2)).value = 'Photo unavailable';
        }
        update('Preparing photos (' + (++done) + ' of ' + rows.length + ')…');
      }
    }));
    update('Writing Excel file…');
    const bytes = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    const download = document.createElement('a');
    download.href = url;
    download.download = 'sgcarmart-listings-' + new Date().toISOString().slice(0, 10) + '.xlsx';
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return missing;
  }

  exportButton.addEventListener('click', async () => {
    const update = message => {
      exportStatus.hidden = false;
      exportStatus.textContent = message;
    };
    exportButton.disabled = true;
    exportButton.dataset.busy = 'true';
    try {
      if (!window.ExcelJS?.Workbook) throw new Error('The Excel library did not load. Reload the page and try again.');
      const rows = await collectSearch(new URL(location.href), terms(includeInput.value), terms(excludeInput.value), update);
      if (!rows.length) {
        update('No matching listings to export.');
        return;
      }
      const missing = await exportWorkbook(rows, update);
      update('Exported ' + rows.length + (rows.length === 1 ? ' listing.' : ' listings.') +
        (missing ? ' Photos unavailable: ' + missing + '.' : ''));
    } catch (error) {
      update('Export failed. ' + error.message);
      console.warn('Sgcarmart Refine Results: export failed', error);
    } finally {
      delete exportButton.dataset.busy;
      scheduleRefresh();
    }
  });

  let queued = false;
  function scheduleRefresh() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      refresh();
    });
  }

  function saveAndRefresh() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        include: includeInput.value,
        exclude: excludeInput.value,
        hidePromos: hidePromosInput.checked,
        moveHandy: moveHandyInput.checked,
      }));
    } catch {
      // Filtering still works when the browser blocks storage.
    }
    scheduleRefresh();
  }

  includeInput.addEventListener('input', saveAndRefresh);
  excludeInput.addEventListener('input', saveAndRefresh);
  hidePromosInput.addEventListener('change', saveAndRefresh);
  moveHandyInput.addEventListener('change', saveAndRefresh);
  shadow.querySelector('button').addEventListener('click', () => {
    includeInput.value = excludeInput.value = '';
    saveAndRefresh();
    includeInput.focus();
  });
  new MutationObserver(scheduleRefresh).observe(document.body, {
    subtree: true, childList: true, characterData: true,
  });
  window.addEventListener('popstate', scheduleRefresh);
  window.addEventListener('resize', scheduleRefresh);
  refresh();
})();
