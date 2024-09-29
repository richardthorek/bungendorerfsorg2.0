
//Load 
document.addEventListener('DOMContentLoaded', function () {
  const githubRepo = 'https://github.com/richardthorek/bungendorerfsorg2.0'; // Replace with your GitHub username/repo
  const contentIds = ['prepareContent', 'fireInfoContent', 'membershipContent', 'eventsContent'];
  const localBasePath = '/public/Content/';
  const githubBasePath = `https://api.github.com/repos/${githubRepo}/contents`;
  

  function fetchMarkdownContent(contentId, filePath) {
      const readmeUrl = `${githubBasePath}${filePath}`;

      fetch(readmeUrl, {
          headers: {
              'Accept': 'application/vnd.github.v3.raw'
          }
      })
          .then(response => {
              if (!response.ok) {
                  throw new Error('Network response was not ok');
              }
              return response.text();
          })
          .then(markdown => {
              document.getElementById(contentId).innerHTML = marked.parse(markdown);
          })
          .catch(error => console.error(`Error fetching ${filePath}:`, error));
  }

  contentIds.forEach(contentId => {
      const filePath = `${localBasePath}${contentId}.md`;
      fetchMarkdownContent(contentId, filePath);
  });
});