(function (app, React) {
const { useState } = React;
const { emptyRecord } = app;

function useRecordState(columns) {
  const [records, setRecords] = useState([]);
  const [recordForm, setRecordForm] = useState(emptyRecord(columns));

  const setListItem = (columnName, itemIndex, value) => {
    const items = Array.isArray(recordForm[columnName]) ? [...recordForm[columnName]] : [""];
    items[itemIndex] = value;
    setRecordForm({ ...recordForm, [columnName]: items });
  };

  const addListItem = (columnName) => {
    const items = Array.isArray(recordForm[columnName]) ? recordForm[columnName] : [];
    setRecordForm({ ...recordForm, [columnName]: [...items, ""] });
  };

  const removeListItem = (columnName, itemIndex) => {
    const items = Array.isArray(recordForm[columnName]) ? [...recordForm[columnName]] : [""];
    const nextItems = items.filter((_, index) => index !== itemIndex);
    setRecordForm({ ...recordForm, [columnName]: nextItems.length > 0 ? nextItems : [""] });
  };

  const resetRecordForm = () => {
    setRecordForm(emptyRecord(columns));
  };

  return {
    records,
    setRecords,
    recordForm,
    setRecordForm,
    setListItem,
    addListItem,
    removeListItem,
    resetRecordForm,
  };
}

app.useRecordState = useRecordState;
})(window.Notcobase, React);
