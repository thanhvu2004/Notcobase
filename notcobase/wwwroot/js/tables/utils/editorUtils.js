(function (app) {
const getEditorPosition = (target) => {
  const rect = target.getBoundingClientRect();
  const popupWidth = 320;
  const margin = 12;
  const left = Math.min(
    Math.max(rect.left, margin),
    Math.max(window.innerWidth - popupWidth - margin, margin),
  );
  const top = rect.bottom + margin > window.innerHeight - 120
    ? Math.max(rect.top - margin, margin)
    : rect.bottom + 6;

  return { left, top };
};

app.EditorUtils = {
  getEditorPosition,
};
})(window.Notcobase);
