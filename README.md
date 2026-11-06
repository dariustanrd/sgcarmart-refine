# Sgcarmart Refine Results

A Violentmonkey userscript for the desktop used-car listing page. It filters the
cards already loaded by Sgcarmart and keeps its native filters, sorting, and links.

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/get-it/) from Firefox
   Add-ons in **Zen**, or from the Chrome Web Store in **Helium**.
2. In Helium, if Violentmonkey asks, open its extension details and enable
   **Allow User Scripts**.
3. In each browser, open the Violentmonkey dashboard and create a new script (or
   edit your existing **Sgcarmart Refine Results** script). Paste the entire
   contents of `sgcarmart-refine.user.js` and save.
4. Open or reload [your saved search](https://www.sgcarmart.com/used-cars/listing?dp2=16000&fr=2020&vts%5B%5D=13&vts%5B%5D=11&fue=Petrol&cl1=4y&page=1).
   The script switches to **100 results per page** and shows **Refine results**
   above the native results bar.

## Use

- **Include any:** Try `Toyota Corolla, Mazda 3, Honda` to match any of those
  phrases in a listing title. Leave this blank to include every make and model.
- **Exclude any:** Try `Axio, Mild Hybrid`. Exclusions win if a title also matches
  an inclusion.
- Matching ignores case and treats punctuation as spaces. It uses the words in
  the title, so `Mazda 3` and `Mazda3` are separate phrases.
- **Hide promotional blocks** is on by default. It hides the separate Star Ads
  and featured dealer block and ad banners. Vehicle listings marked **Premium
  Ad** stay eligible for your search. Uncheck the toggle to show the blocks.
- **Move Handy Tools below filters** is on by default. The original tiles
  appear above the results heading and align with the listings. Uncheck the
  toggle to return them to their original position among the listings.
- Preferences are saved in the current browser profile. **Clear** resets both
  text fields without changing either toggle.
- The script automatically uses **100 results per page**. When switching from
  another page size, it keeps your native search criteria and returns to the
  first page. If the search still spans multiple pages, the count is for the
  current page and the same refinements apply as you navigate.
- **Export to Excel** downloads all matching listings across the search pages,
  including your Include and Exclude filters. The workbook has filterable
  headers, separate numeric and date fields, clickable listing links, and one
  embedded thumbnail per listing when available. If a photo cannot be downloaded,
  its source URL is included when Sgcarmart provides one.

The workbook is built in the browser with ExcelJS. The script only requests
result pages and photos when you click **Export to Excel**. It exports data from
the search results; it does not visit each car's detail page.
