# WA Sienna Finder

An ad-free static inventory view for used 2022-and-newer Toyota Sienna listings at Washington dealers.

**Public site:** https://timch-ms.github.io/wa-sienna-finder/

The browser reads only the checked-in sanitized inventory snapshot. A guarded GitHub Actions workflow refreshes the snapshot once per Washington calendar day, uses at most 10 inventory API calls, retains the previous snapshot on failures or suspicious result counts, and then deploys an explicit static-file allowlist.

Add the inventory API credential as the repository Actions secret `INVENTORY_API_KEY` under **Settings → Secrets and variables → Actions**. Until that secret exists, scheduled runs exit without reserving the day or making requests.
