const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Wait for any network events to settle
  const reportUrl = 'https://psp-backend.fly.dev/?reportOnly=true&athleteName=Ruby%20Lee&recordedDate=test&level=high_school&growthMindsetPercentile=10&growthMindsetPercentileCollege=10&growthMindsetPercentilePro=10&mentalSkillsPercentile=20&mentalSkillsPercentileCollege=20&mentalSkillsPercentilePro=20&teamSupportPercentile=30&teamSupportPercentileCollege=30&teamSupportPercentilePro=30&healthHabitsPercentile=40&healthHabitsPercentileCollege=40&healthHabitsPercentilePro=40&selfReflectionPercentile=50&selfReflectionPercentileCollege=50&selfReflectionPercentilePro=50'
  // const reportUrl = "http://localhost:3000/?reportOnly=true&athleteName=Ruby%20Lee&recordedDate=test&level=high_school&growthMindsetPercentile=10&growthMindsetPercentileCollege=10&growthMindsetPercentilePro=10&mentalSkillsPercentile=20&mentalSkillsPercentileCollege=20&mentalSkillsPercentilePro=20&teamSupportPercentile=30&teamSupportPercentileCollege=30&teamSupportPercentilePro=30&healthHabitsPercentile=40&healthHabitsPercentileCollege=40&healthHabitsPercentilePro=40&selfReflectionPercentile=50&selfReflectionPercentileCollege=50&selfReflectionPercentilePro=50";
  await page.goto(reportUrl, {
    waitUntil: "networkidle2"
  });

  // Wait for survey response to load
  // TODO: Make this more reliable
  await new Promise(function(resolve) { 
    setTimeout(resolve, 4000);
  });

  await page.pdf({
    path: "output/report.pdf",
    format: "Letter",
    printBackground: true,
  });

  await browser.close();
})();