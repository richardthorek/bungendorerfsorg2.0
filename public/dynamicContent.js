document.addEventListener('DOMContentLoaded', function () {
    const githubRepo = 'richardthorek/bungendorerfsorg2.0'; // Replace with your GitHub username/repo
    const contentIds = ['prepareContent', 'fireInfoContent', 'membershipContent', 'eventsContent'];
    const localBasePath = '/public/Content/';
    const githubBasePath = `https://api.github.com/repos/${githubRepo}/contents/public/Content/`;

    function fetchMarkdownContent(contentId, filePath) {
        const githubUrl = `${githubBasePath}${filePath}`;

        fetch(githubUrl, {
            headers: {
                'Accept': 'application/vnd.github.v3.raw'
            }
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok for ${githubUrl}`);
                }
                return response.text();
            })
            .then(markdown => {
                document.getElementById(contentId).innerHTML = marked.parse(markdown);
            })
            .catch(error => {
                console.error(`Error fetching ${filePath} from GitHub:`, error);
                // Fallback to local file if GitHub fetch fails
                fetchLocalMarkdownContent(contentId, filePath);
            });
    }

    function fetchLocalMarkdownContent(contentId, filePath) {
        const localUrl = `${localBasePath}${filePath}`;

        fetch(localUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok for ${localUrl}`);
                }
                return response.text();
            })
            .then(markdown => {
                document.getElementById(contentId).innerHTML = marked.parse(markdown);
            })
            .catch(error => console.error(`Error fetching ${filePath} from local:`, error));
    }

    contentIds.forEach(contentId => {
        const filePath = `${contentId}.md`;
        fetchMarkdownContent(contentId, filePath);
    });
});
