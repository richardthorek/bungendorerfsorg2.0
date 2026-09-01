document.addEventListener("DOMContentLoaded", function () {
  const contentIds = [
    "prepareContent",
    "fireInfoContent",
    "membershipContent",
    "eventsContent",
    "bushfireRiskContent",
    "neighbourhoodSaferPlaceContent",
    "animalsInBushfireContent",
    "permitsContent",
  ];
  const localBasePath = "/Content/";

  function fetchLocalMarkdownContent(contentId, filePath) {
    const localUrl = `${localBasePath}${filePath}`;

    return fetch(localUrl)
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

  // content-cards.js needs every content div actually populated before it can
  // split them into individual swipeable cards — this fires once all of them
  // have settled (success or failure alike), rather than making that module
  // guess or poll for readiness.
  Promise.all(
    contentIds.map((contentId) => fetchLocalMarkdownContent(contentId, `${contentId}.md`))
  ).then(() => {
    document.dispatchEvent(new CustomEvent("bungendore:content-ready"));
  });
});
