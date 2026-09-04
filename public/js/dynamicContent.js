document.addEventListener("DOMContentLoaded", function () {
  // Prepare/Membership/Events content moved to admin-managed cards
  // (awareness-cards.js) — only Fire Information's markdown remains here.
  const contentIds = ["fireInfoContent", "permitsContent"];
  const localBasePath = "/Content/";

  function fetchLocalMarkdownContent(contentId, filePath) {
    const localUrl = `${localBasePath}${filePath}`;

    fetch(localUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Network response was not ok for ${localUrl}`);
        }
        return response.text();
      })
      .then((markdown) => {
        document.getElementById(contentId).innerHTML = DOMPurify.sanitize(marked.parse(markdown));
      })
      .catch((error) => console.error(`Error fetching ${filePath} from local:`, error));
  }

  contentIds.forEach((contentId) => fetchLocalMarkdownContent(contentId, `${contentId}.md`));
});
