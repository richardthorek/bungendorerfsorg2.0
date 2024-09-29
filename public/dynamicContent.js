
//Load 

document.addEventListener('DOMContentLoaded', function () {
      const githubRepo = 'https://github.com/richardthorek/bungendorerfsorg2.0'; // Replace with your GitHub username/repo
      const readmeUrl = `https://api.github.com/repos/${githubRepo}/contents/README.md`;

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
          document.getElementById('documentationContent').innerHTML = marked.parse(markdown);
        })
        .catch(error => console.error('Error fetching README.md:', error));
    });