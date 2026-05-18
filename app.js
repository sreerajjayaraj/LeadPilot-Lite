const STORAGE_KEY = "leadpilot-lite-leads-v1";

const leadList = document.querySelector("#leadList");
const template = document.querySelector("#leadCardTemplate");
const dialog = document.querySelector("#leadDialog");
const form = document.querySelector("#leadForm");
const addLeadButton = document.querySelector("#addLeadButton");
const closeDialog = document.querySelector("#closeDialog");
const cancelButton = document.querySelector("#cancelButton");
const deleteButton = document.querySelector("#deleteButton");
const searchInput = document.querySelector("#searchInput");
const exportButton = document.querySelector("#exportButton");
const copyTopMessage = document.querySelector("#copyTopMessage");
const installButton = document.querySelector("#installButton");

const fields = {
  id: document.querySelector("#leadId"),
  name: document.querySelector("#nameInput"),
  contact: document.querySelector("#contactInput"),
  service: document.querySelector("#serviceInput"),
  value: document.querySelector("#valueInput"),
  temperature: document.querySelector("#temperatureInput"),
  source: document.querySelector("#sourceInput"),
  stage: document.querySelector("#stageInput"),
  lastContact: document.querySelector("#lastContactInput"),
  notes: document.querySelector("#notesInput"),
};

let leads = loadLeads();
let activeFilter = "due";
let deferredInstallPrompt = null;
let topMessage = "";

function loadLeads() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return [
    {
      id: crypto.randomUUID(),
      name: "Maya Salon",
      contact: "+971 50 123 4567",
      service: "Instagram booking automation",
      value: 2400,
      temperature: "Hot",
      source: "Referral",
      stage: "Proposal",
      lastContact: daysAgo(2),
      notes: "Owner wants WhatsApp reminders and fewer missed appointments.",
      createdAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: "BrightFix AC",
      contact: "owner@brightfix.example",
      service: "Lead response system",
      value: 1800,
      temperature: "Warm",
      source: "Google Business",
      stage: "Contacted",
      lastContact: daysAgo(4),
      notes: "Asked for a simple way to reply faster to service requests.",
      createdAt: new Date().toISOString(),
    },
  ];
}

function daysAgo(count) {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return date.toISOString().slice(0, 10);
}

function saveLeads() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

function scoreLead(lead) {
  const age = daysSince(lead.lastContact);
  const tempScore = { Hot: 42, Warm: 26, Cold: 12 }[lead.temperature] || 16;
  const stageScore = { New: 20, Contacted: 26, Proposal: 34, Won: -80, Lost: -90 }[lead.stage] || 15;
  const valueScore = Math.min(20, Math.floor((Number(lead.value) || 0) / 250));
  const ageScore = Math.min(24, age * 4);
  return Math.max(0, Math.min(99, tempScore + stageScore + valueScore + ageScore));
}

function daysSince(dateString) {
  if (!dateString) return 7;
  const then = new Date(`${dateString}T00:00:00`);
  const now = new Date();
  return Math.max(0, Math.floor((now - then) / 86400000));
}

function nextDueText(lead) {
  const age = daysSince(lead.lastContact);
  if (lead.stage === "Won") return "Closed won";
  if (lead.stage === "Lost") return "Closed lost";
  if (lead.temperature === "Hot" && age >= 1) return "Due now";
  if (lead.temperature === "Warm" && age >= 3) return "Due now";
  if (lead.temperature === "Cold" && age >= 7) return "Due now";
  return `Follow up in ${Math.max(1, followUpInterval(lead) - age)}d`;
}

function followUpInterval(lead) {
  return { Hot: 1, Warm: 3, Cold: 7 }[lead.temperature] || 3;
}

function isDue(lead) {
  return !["Won", "Lost"].includes(lead.stage) && daysSince(lead.lastContact) >= followUpInterval(lead);
}

function generateMessage(lead) {
  const service = lead.service || "the project";
  const noteHint = lead.notes ? ` I was thinking about ${lead.notes.split(".")[0].toLowerCase()}.` : "";

  if (lead.stage === "Proposal") {
    return `Hi ${lead.name}, just checking in on the ${service} proposal. Happy to adjust the scope so it fits what you need.${noteHint}`;
  }

  if (lead.temperature === "Hot") {
    return `Hi ${lead.name}, quick follow-up on ${service}. I can help you move this forward today if you want me to send the next step.`;
  }

  if (lead.temperature === "Cold") {
    return `Hi ${lead.name}, hope things are going well. Is ${service} still something you want to improve this month?`;
  }

  return `Hi ${lead.name}, following up on ${service}. Would you like me to send a simple next step or estimate?`;
}

function sortedLeads() {
  const query = searchInput.value.trim().toLowerCase();
  return leads
    .filter((lead) => {
      if (activeFilter === "due" && !isDue(lead)) return false;
      if (activeFilter === "won" && lead.stage !== "Won") return false;
      if (activeFilter === "lost" && lead.stage !== "Lost") return false;
      if (!query) return true;
      return [lead.name, lead.contact, lead.service, lead.source, lead.notes]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => scoreLead(b) - scoreLead(a));
}

function render() {
  saveLeads();
  renderMetrics();
  renderAssistant();
  renderList();
}

function renderMetrics() {
  document.querySelector("#dueCount").textContent = leads.filter(isDue).length;
  document.querySelector("#hotCount").textContent = leads.filter((lead) => lead.temperature === "Hot" && !["Won", "Lost"].includes(lead.stage)).length;
  const value = leads
    .filter((lead) => !["Won", "Lost"].includes(lead.stage))
    .reduce((sum, lead) => sum + (Number(lead.value) || 0), 0);
  document.querySelector("#pipelineValue").textContent = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function renderAssistant() {
  const candidate = leads.filter(isDue).sort((a, b) => scoreLead(b) - scoreLead(a))[0];
  const title = document.querySelector("#assistantTitle");
  const text = document.querySelector("#assistantText");

  if (!candidate) {
    topMessage = "";
    copyTopMessage.disabled = true;
    title.textContent = "No urgent follow-up right now";
    text.textContent = "Add or update leads and the assistant will surface the highest-value next action automatically.";
    return;
  }

  topMessage = generateMessage(candidate);
  copyTopMessage.disabled = false;
  title.textContent = `Contact ${candidate.name} first`;
  text.textContent = `${candidate.temperature} ${candidate.stage.toLowerCase()} lead worth ${formatMoney(candidate.value)}. Suggested message: ${topMessage}`;
}

function renderList() {
  leadList.replaceChildren();
  const visible = sortedLeads();

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No leads match this view.";
    leadList.append(empty);
    return;
  }

  visible.forEach((lead) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = lead.id;
    node.querySelector("h3").textContent = lead.name;
    node.querySelector(".lead-meta").textContent = `${nextDueText(lead)} | ${lead.temperature} | ${lead.stage} | ${formatMoney(lead.value)}`;
    node.querySelector(".lead-service").textContent = `${lead.service} from ${lead.source || "direct lead"}`;
    node.querySelector(".lead-score").textContent = scoreLead(lead);
    node.querySelector(".lead-message").textContent = generateMessage(lead);
    node.querySelector(".copy-message").addEventListener("click", () => copyText(generateMessage(lead)));
    node.querySelector(".mark-contacted").addEventListener("click", () => markContacted(lead.id));
    node.querySelector(".edit-lead").addEventListener("click", () => openDialog(lead));
    leadList.append(node);
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function openDialog(lead = null) {
  form.reset();
  const isEdit = Boolean(lead);
  document.querySelector("#dialogTitle").textContent = isEdit ? "Edit lead" : "Add lead";
  deleteButton.classList.toggle("hidden", !isEdit);

  fields.id.value = lead?.id || "";
  fields.name.value = lead?.name || "";
  fields.contact.value = lead?.contact || "";
  fields.service.value = lead?.service || "";
  fields.value.value = lead?.value || "";
  fields.temperature.value = lead?.temperature || "Warm";
  fields.source.value = lead?.source || "";
  fields.stage.value = lead?.stage || "New";
  fields.lastContact.value = lead?.lastContact || new Date().toISOString().slice(0, 10);
  fields.notes.value = lead?.notes || "";
  dialog.showModal();
}

function closeLeadDialog() {
  dialog.close();
}

function upsertLead(event) {
  event.preventDefault();
  const id = fields.id.value || crypto.randomUUID();
  const lead = {
    id,
    name: fields.name.value.trim(),
    contact: fields.contact.value.trim(),
    service: fields.service.value.trim(),
    value: Number(fields.value.value) || 0,
    temperature: fields.temperature.value,
    source: fields.source.value.trim(),
    stage: fields.stage.value,
    lastContact: fields.lastContact.value || new Date().toISOString().slice(0, 10),
    notes: fields.notes.value.trim(),
    createdAt: leads.find((item) => item.id === id)?.createdAt || new Date().toISOString(),
  };

  leads = leads.some((item) => item.id === id)
    ? leads.map((item) => (item.id === id ? lead : item))
    : [lead, ...leads];
  closeLeadDialog();
  render();
}

function deleteLead() {
  const id = fields.id.value;
  leads = leads.filter((lead) => lead.id !== id);
  closeLeadDialog();
  render();
}

function markContacted(id) {
  leads = leads.map((lead) => {
    if (lead.id !== id) return lead;
    const nextStage = lead.stage === "New" ? "Contacted" : lead.stage;
    return { ...lead, stage: nextStage, lastContact: new Date().toISOString().slice(0, 10) };
  });
  render();
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function exportCsv() {
  const headers = ["Name", "Contact", "Service", "Value", "Temperature", "Source", "Stage", "Last Contact", "Notes"];
  const rows = leads.map((lead) => [
    lead.name,
    lead.contact,
    lead.service,
    lead.value,
    lead.temperature,
    lead.source,
    lead.stage,
    lead.lastContact,
    lead.notes,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "leadpilot-leads.csv";
  link.click();
  URL.revokeObjectURL(url);
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    activeFilter = tab.dataset.filter;
    render();
  });
});

addLeadButton.addEventListener("click", () => openDialog());
closeDialog.addEventListener("click", closeLeadDialog);
cancelButton.addEventListener("click", closeLeadDialog);
deleteButton.addEventListener("click", deleteLead);
form.addEventListener("submit", upsertLead);
searchInput.addEventListener("input", render);
exportButton.addEventListener("click", exportCsv);
copyTopMessage.addEventListener("click", () => copyText(topMessage));

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.classList.remove("hidden");
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.classList.add("hidden");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js");
  });
}

render();
