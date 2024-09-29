document.addEventListener('DOMContentLoaded', function () {
    const contentIds = ['prepareContent', 'fireInfoContent', 'membershipContent', 'eventsContent'];
    const localBasePath = '/Content/';

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
        fetchLocalMarkdownContent(contentId, filePath);
    });
});