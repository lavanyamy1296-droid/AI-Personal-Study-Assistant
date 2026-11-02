const $ = (id) => document.getElementById(id);
let documents = [];
let activeQuiz = [];

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Something went wrong.");
  return data;
}
function showStatus(message, isError = false) {
  $("status").textContent = message;
  $("status").style.color = isError ? "#d65e68" : "#6b5ce7";
}
function switchView(view) {
  document.querySelectorAll(".view").forEach(el => el.classList.add("hidden"));
  $(`${view}-view`).classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  $("page-title").textContent = view === "library" ? "My Library" : view === "assistant" ? "PDF Assistant" : "Practice Quiz";
}
document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));

async function refreshDocuments() {
  documents = await api("/api/documents");
  $("doc-count").textContent = `${documents.length} document${documents.length === 1 ? "" : "s"} in your library`;
  $("documents").innerHTML = "";
  if (!documents.length) {
    $("documents").innerHTML = '<div class="empty-state">No documents yet. Upload your first PDF to get started.</div>';
  }
  documents.forEach(doc => {
    const card = document.createElement("article");
    card.className = "doc-card";
    const top = document.createElement("div"); top.className = "doc-top";
    top.innerHTML = '<span class="pdf-icon">PDF</span><span style="font-size:10px;color:#999">STUDY FILE</span>';
    const title = document.createElement("h3"); title.textContent = doc.filename;
    const meta = document.createElement("p"); meta.textContent = `${Number(doc.characters).toLocaleString()} characters`;
    const actions = document.createElement("div"); actions.className = "doc-actions";
    [["Summary", "summary"], ["Use PDF", "assistant"], ["Quiz", "quiz"], ["Delete", "delete"]].forEach(([label, action]) => {
      const button = document.createElement("button"); button.className = "small-btn" + (action === "delete" ? " delete-btn" : ""); button.textContent = label;
      button.addEventListener("click", () => action === "summary" ? showSummary(doc.id) : action === "delete" ? removeDoc(doc.id) : (switchView(action), setSelects(doc.id)));
      actions.append(button);
    });
    card.append(top, title, meta, actions); $("documents").append(card);
  });
  ["assistant-doc", "quiz-doc"].forEach(id => {
    const select = $(id); const previous = select.value; select.innerHTML = "";
    if (!documents.length) { select.add(new Option("Upload a PDF first", "")); return; }
    documents.forEach(doc => select.add(new Option(doc.filename, doc.id)));
    if (documents.some(d => d.id === previous)) select.value = previous;
  });
}
function setSelects(id) {
  if (id) { $("assistant-doc").value = id; $("quiz-doc").value = id; }
}
async function upload(file) {
  if (!file) return;
  showStatus("Uploading and reading your PDF...");
  const form = new FormData(); form.append("file", file);
  try {
    const result = await api("/api/upload", {method:"POST", body:form});
    showStatus(`Uploaded ${result.filename} successfully.`);
    await refreshDocuments();
  } catch (error) { showStatus(error.message, true); }
  $("file-input").value = "";
}
$("upload-trigger").addEventListener("click", () => $("file-input").click());
$("browse-trigger").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", e => upload(e.target.files[0]));
const drop = $("drop-zone");
drop.addEventListener("dragover", e => {e.preventDefault(); drop.style.background="#f7f5ff";});
drop.addEventListener("dragleave", () => drop.style.background="#fff");
drop.addEventListener("drop", e => {e.preventDefault(); drop.style.background="#fff"; upload(e.dataTransfer.files[0]);});

async function showSummary(id) {
  try {
    const result = await api(`/api/documents/${id}/summary`);
    const w = window.open("", "_blank", "width=700,height=600");
    if (!w) { alert(result.summary); return; }
    const heading = document.createElement("h2"); heading.textContent = "Study summary";
    const paragraph = document.createElement("p"); paragraph.textContent = result.summary; paragraph.style.whiteSpace = "pre-wrap";
    w.document.body.style.cssText = "font:16px Arial;line-height:1.7;padding:30px;color:#25243a";
    w.document.body.append(heading, paragraph);
  } catch (error) { showStatus(error.message, true); }
}
async function removeDoc(id) {
  if (!confirm("Delete this PDF from your library?")) return;
  try { await api(`/api/documents/${id}`, {method:"DELETE"}); await refreshDocuments(); showStatus("Document deleted."); }
  catch (error) { showStatus(error.message, true); }
}
$("chat-form").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("assistant-doc").value, question = $("question").value.trim();
  if (!id) return;
  addMessage(question, true); $("question").value = "";
  try { const result = await api(`/api/documents/${id}/chat`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question})}); addMessage(result.answer, false); }
  catch (error) { addMessage(error.message, false); }
});
function addMessage(text, user) {
  const div = document.createElement("div"); div.className = user ? "user-message" : "assistant-message"; div.textContent = text;
  $("chat-window").append(div); $("chat-window").scrollTop = $("chat-window").scrollHeight;
}
$("generate-quiz").addEventListener("click", async () => {
  const id = $("quiz-doc").value;
  if (!id) return;
  $("quiz-area").textContent = "Creating questions...";
  try {
    const data = await api(`/api/documents/${id}/mcqs?count=5`);
    activeQuiz = data.questions;
    renderQuiz();
  } catch (error) { $("quiz-area").textContent = error.message; }
});
function renderQuiz() {
  const area = $("quiz-area"); area.innerHTML = "";
  if (!activeQuiz.length) { area.textContent = "Couldn't create enough questions from this PDF. Try a longer text-based PDF."; return; }
  activeQuiz.forEach((q, i) => {
    const box = document.createElement("div"); box.className = "quiz-question";
    const h = document.createElement("h3"); h.textContent = `${i+1}. ${q.question}`; box.append(h);
    q.options.forEach((option, j) => {
      const label = document.createElement("label"); label.className = "quiz-option";
      const input = document.createElement("input"); input.type = "radio"; input.name = `q${i}`; input.value = option;
      label.append(input, document.createTextNode(option)); box.append(label);
    });
    area.append(box);
  });
  const submit = document.createElement("button"); submit.className = "primary-btn"; submit.textContent = "Submit answers"; submit.style.marginTop = "18px";
  submit.addEventListener("click", () => {
    let score = 0;
    activeQuiz.forEach((q, i) => { const selected = document.querySelector(`input[name="q${i}"]:checked`); if (selected && selected.value.toLowerCase() === q.answer.toLowerCase()) score++; });
    let result = area.querySelector(".quiz-result");
    if (!result) { result = document.createElement("div"); result.className = "quiz-result"; area.append(result); }
    result.textContent = `Your score: ${score} / ${activeQuiz.length}`;
  });
  area.append(submit);
}
refreshDocuments().catch(err => showStatus(err.message, true));
