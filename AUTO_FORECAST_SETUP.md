# My GPF automatic Thai-stock and gold scenario

This code uses the **existing** Google Apps Script functions `getSS()` and `fetchYahooData()`. GitHub Pages cannot run spreadsheet time triggers. Adding this repository file does NOT activate the forecast until the following one-time Apps Script steps are completed.

1. Open the Google Apps Script **project already deployed** for the My GPF website and linked to the original `person_GPF2026` spreadsheet.
2. In that same Apps Script project, use **+ > Script** to add a file named `AutoForecast`.
3. Copy the contents of `AutoForecast.gs` from this repository into that new Apps Script file, and save. Do NOT replace `Code.gs`, `index.html`, or the published web-app URL.
4. Select `installAutoForecast` in the Apps Script function dropdown and click **Run** once. Approve the Google authorization prompts. This registers exactly one four-hourly trigger and runs the first refresh immediately.
5. Inspect the new `forecast_live` sheet. The first three rows show the Thai-stock and gold indicative NAV scenarios, source/date, coverage, and warning status. Rows below show each market quote. A later run **updates the snapshot** rather than appending a misleading historical NAV.
6. Open **Triggers** and **Executions** in Apps Script to confirm `autoForecastScheduled` and review any external-price errors. Automatic updates are limited to weekdays 08:00-20:59 Bangkok time, about every four hours; exact trigger time is controlled by Google.
7. To stop the automation, remove the `autoForecastScheduled` trigger from Apps Script. Do not delete official NAV history.

## Accuracy and safety

- The official Thai-stock and gold NAV baseline is selected from the latest valid date in the imported `nav` tab. If it is older than 14 days, **no estimate is displayed**.
- Thai weights come from `set!B1:K1`. Ten Thai stock daily moves are combined with the remaining weight represented by Yahoo `^SET100`. When the index quote is missing, its weight is explicitly held flat and the status is `PARTIAL`.
- Gold uses daily return of `GLD` multiplied by daily USD/THB change (`THB=X`). This is a proxy, not the historical regression equation from `spdr`; both the official NAV and historical model are left unchanged.
- Trading-hours alignment, fees, dividends, rebalancing, foreign-market time differences, stale quotes, and fund-specific exposures may cause substantial differences from the official GPF NAV. The preview is **not an official price or investment recommendation**.
- The script writes only to `forecast_live`; it never overwrites historical price cells, user portfolio data, or `AdminConfig`. Do not put API keys or passwords in this repository or public sheet.
