const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  const reportUrl = 'https://psp-backend.fly.dev/?reportOnly=true&athleteName=Ruby%20Lee&recordedDate=test&level=high_school&growthMindsetPercentile=10&growthMindsetPercentileCollege=10&growthMindsetPercentilePro=10&mentalSkillsPercentile=20&mentalSkillsPercentileCollege=20&mentalSkillsPercentilePro=20&teamSupportPercentile=30&teamSupportPercentileCollege=30&teamSupportPercentilePro=30&healthHabitsPercentile=40&healthHabitsPercentileCollege=40&healthHabitsPercentilePro=40&selfReflectionPercentile=50&selfReflectionPercentileCollege=50&selfReflectionPercentilePro=50';
  await page.goto(reportUrl)

  // Wait for page to fully load
  await new Promise(function(resolve) { 
    setTimeout(resolve, 4000);
  });

  await page.pdf({ path: 'output/report_playwright.pdf' })
  await browser.close()
})();