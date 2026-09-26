const sections = document.querySelectorAll('.workspace');
const navItems = document.querySelectorAll('.nav-item');
const toast = document.getElementById('toast');
const resumeText = document.getElementById('resumeText');
const profileNameInput = document.getElementById('profileName');
const careerFocusInput = document.getElementById('careerFocus');
const greeting = document.getElementById('greeting');
const fileInput = document.getElementById('resumeFile');
const dropzone = document.getElementById('dropzone');
let currentAnalysis = null;
let currentMatch = null;
let currentResumeFileName = 'Resume analysis';
let toastTimer;

function notify(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = value == null ? '' : String(value);
  return node.innerHTML;
}

function showSection(id) {
  document.querySelector('.dashboard').style.display = id === 'overview' ? 'block' : 'none';
  sections.forEach(section => section.style.display = section.id === id ? 'block' : 'none');
  navItems.forEach(item => item.classList.toggle('active', item.getAttribute('href') === `#${id}`));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (id === 'reports') loadReports();
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await response.json() : await response.blob();
  if (!response.ok) {
    const error = new Error(body.error || 'Something went wrong.');
    error.code = body.code || '';
    throw error;
  }
  return body;
}

document.querySelectorAll('[data-scroll]').forEach(button => button.addEventListener('click', () => showSection(button.dataset.scroll)));
navItems.forEach(item => item.addEventListener('click', event => {
  event.preventDefault();
  showSection(item.getAttribute('href').slice(1));
}));

function resetDropzone() {
  dropzone.querySelector('h3').textContent = 'Drop your resume here';
  dropzone.querySelector('p').textContent = 'PDF or DOCX, up to 10 MB';
}

['dragenter', 'dragover'].forEach(eventName => dropzone.addEventListener(eventName, event => {
  event.preventDefault();
  dropzone.classList.add('drag');
}));
['dragleave', 'drop'].forEach(eventName => dropzone.addEventListener(eventName, event => {
  event.preventDefault();
  dropzone.classList.remove('drag');
}));

dropzone.addEventListener('drop', event => {
  const file = event.dataTransfer.files[0];
  if (file) uploadResume(file);
});

// Keep the file input hidden and open it from the visible controls.
dropzone.addEventListener('click', event => {
  if (!event.target.closest('button')) fileInput.click();
});

dropzone.querySelector('.browse-files').addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) uploadResume(fileInput.files[0]);
});

async function loadScriptOnce(src, globalName) {
  if (globalName && window[globalName]) return window[globalName];
  const existing = [...document.scripts].find(script => script.src === src);
  if (existing) {
    await new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  } else {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load the OCR engine. Please check your internet connection and try again.'));
      document.head.appendChild(script);
    });
  }
  if (globalName && !window[globalName]) throw new Error('OCR engine loaded but was not initialized.');
  return globalName ? window[globalName] : true;
}

async function ocrPdf(file, progressCallback) {
  const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  const Tesseract = await loadScriptOnce('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', 'Tesseract');
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = Math.min(pdf.numPages, 12);
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: message => {
      if (message.status === 'recognizing text' && typeof message.progress === 'number') progressCallback(message.progress);
    }
  });
  let combined = '';
  try {
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1.5 });
      const scale = Math.min(2.2, 1800 / baseViewport.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      await page.render({ canvasContext: context, viewport }).promise;
      const result = await worker.recognize(canvas);
      combined += `\n${result.data.text || ''}`;
      progressCallback(pageNumber / pages);
      canvas.width = 1;
      canvas.height = 1;
    }
  } finally {
    await worker.terminate();
  }
  const text = combined.replace(/\s+/g, ' ').trim();
  if (text.length < 40) throw new Error('OCR could not find enough readable text. Please use a clearer PDF or DOCX file.');
  return text;
}

async function uploadResume(file) {
  const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const validExtension = /\.(pdf|docx)$/i.test(file.name);
  if ((!allowed.includes(file.type) && !validExtension) || file.size > 10 * 1024 * 1024) {
    return notify('Use a PDF or DOCX file that is 10 MB or smaller.');
  }

  const heading = dropzone.querySelector('h3');
  const description = dropzone.querySelector('p');
  const browseButton = dropzone.querySelector('.browse-files');
  heading.textContent = 'Uploading and reading your resume…';
  description.textContent = file.name;
  browseButton.disabled = true;
  dropzone.classList.add('is-uploading');

  try {
    const form = new FormData();
    form.append('resume', file, file.name);
    const result = await api('/api/upload', { method: 'POST', body: form });
    currentResumeFileName = result.fileName || file.name || 'Resume analysis';
    resumeText.value = result.text;
    heading.textContent = result.fileName;
    description.textContent = `${result.characters.toLocaleString()} characters extracted. Starting analysis…`;
    notify('Resume uploaded successfully. Analyzing it now…');

    await analyzeResume();
    description.textContent = `${result.characters.toLocaleString()} characters extracted. Analysis complete.`;
    showSection('analyze');
    document.getElementById('analysisResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (error.code === 'PDF_TEXT_MISSING' && /\.pdf$/i.test(file.name)) {
      try {
        heading.textContent = 'Scanned PDF detected — reading with OCR…';
        description.textContent = 'This may take a little longer.';
        const text = await ocrPdf(file, progress => {
          const percent = Math.round(progress * 100);
          description.textContent = `OCR progress: ${percent}%`;
        });
        resumeText.value = text;
        heading.textContent = file.name;
        description.textContent = `${text.length.toLocaleString()} characters extracted with OCR. Starting analysis…`;
        notify('Scanned PDF read successfully. Analyzing it now…');
        await analyzeResume();
        description.textContent = `${text.length.toLocaleString()} characters extracted with OCR. Analysis complete.`;
        showSection('analyze');
        document.getElementById('analysisResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      } catch (ocrError) {
        resetDropzone();
        notify(ocrError.message || 'OCR could not read this PDF. Please try a clearer PDF or DOCX file.');
        return;
      }
    }
    resetDropzone();
    notify(error.message || 'Resume upload failed. Please try another PDF or DOCX file.');
  } finally {
    browseButton.disabled = false;
    dropzone.classList.remove('is-uploading');
    fileInput.value = '';
  }
}

async function saveAnalysisReport(analysis) {
  const title = currentResumeFileName && currentResumeFileName !== 'Resume analysis'
    ? currentResumeFileName.replace(/\.[^.]+$/, '')
    : 'Resume analysis';
  try {
    await api('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, analysis })
    });
    return true;
  } catch (error) {
    console.error('Could not save report:', error);
    notify('Analysis completed, but the report could not be saved.');
    return false;
  }
}

async function analyzeResume() {
  const resume = resumeText.value.trim();
  if (resume.length < 40) {
    throw new Error('Upload or paste at least 40 characters of resume text first.');
  }

  const button = document.getElementById('analyzeButton');
  const original = button.innerHTML;
  button.textContent = 'Analyzing…';
  button.disabled = true;
  try {
    const analysis = await api('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeText: resume,
        jobDescription: document.getElementById('jobDescription').value
      })
    });
    renderAnalysis(analysis);
    await saveAnalysisReport(analysis);
    notify(analysis.aiFallback ? 'AI service failed, so a fresh local analysis was used.' : `${analysis.source === 'openai' ? 'AI' : 'Local'} analysis is ready.`);
    return analysis;
  } finally {
    button.innerHTML = original;
    button.disabled = false;
  }
}

document.getElementById('loadSample').addEventListener('click', () => {
  resumeText.value = `Alex Smith
AI/ML Engineer

Summary
Final-year computer science student building machine learning and NLP applications with Python.

Experience
AI/ML Intern, Atlas Labs — 2025–Present
• Built a document classification pipeline in Python that improved processing speed by 32%.
• Developed a resume matching prototype using NLP and keyword similarity for 2,000+ records.

Projects
• Created a customer churn prediction model using scikit-learn and pandas.
• Built a semantic search application with embeddings and a vector database.

Skills
Python, Machine Learning, NLP, SQL, pandas, NumPy, scikit-learn, Git, Docker`;
  notify('Sample resume loaded.');
});

function updateScoreRing(score) {
  const ring = document.querySelector('.score-ring');
  document.querySelector('.score-ring b').textContent = score;
  ring.style.setProperty('--score', `${score * 3.6}deg`);
}

function renderAnalysis(analysis) {
  currentAnalysis = analysis;
  updateScoreRing(analysis.resumeScore);
  document.querySelector('.success-badge').textContent = analysis.source === 'openai' && !analysis.aiFallback ? '✓ AI analysis complete' : '✓ Local analysis complete';
  document.querySelector('.result-score h3').textContent = analysis.resumeScore >= 85 ? 'Great foundation' : analysis.resumeScore >= 70 ? 'Good foundation' : 'Room to improve';
  document.querySelector('.result-score p').textContent = analysis.summary || 'Your resume was reviewed against structure, skills, language, and measurable impact.';

  const cards = document.querySelectorAll('.result-grid .panel');
  cards[1].innerHTML = `<h3>Strengths to keep</h3>${(analysis.strengths || []).map(item => `<div class="check-item"><b>✓</b><span>${escapeHtml(item)}</span></div>`).join('')}`;
  cards[2].innerHTML = `<h3>Priority improvements</h3>${(analysis.improvements || []).map((item, index) => `<div class="priority-item"><b>${index + 1}</b><span>${escapeHtml(item)}</span></div>`).join('')}`;

  document.getElementById('analysisResults').hidden = false;
  updateDashboard(analysis);
}

function updateDashboard(analysis) {
  const score = Number(analysis.resumeScore);
  const ats = Number(analysis.atsScore);
  const skills = Array.isArray(analysis.matchedSkills) ? analysis.matchedSkills.length : 0;
  const metricCards = document.querySelectorAll('.metrics-grid .metric-card');
  if (metricCards[0]) {
    metricCards[0].querySelector('h3').innerHTML = `${score}<span>/100</span>`;
    metricCards[0].querySelector('small').textContent = 'Based on this resume';
  }
  if (metricCards[1]) {
    metricCards[1].querySelector('h3').innerHTML = `${ats}<span>%</span>`;
    metricCards[1].querySelector('small').textContent = 'Based on this resume';
  }
  if (metricCards[2]) {
    metricCards[2].querySelector('h3').textContent = skills;
    metricCards[2].querySelector('small').textContent = `${skills} relevant skills or terms found`;
  }

  const heroScore = document.querySelector('.mini-score b');
  const heroStatus = document.querySelector('.mini-score small');
  if (heroScore) heroScore.textContent = score;
  if (heroStatus) heroStatus.textContent = score >= 85 ? 'Strong' : score >= 70 ? 'Good' : 'Needs work';

  const healthBars = document.querySelectorAll('.health-row');
  const signals = analysis.signals || {};
  const values = [
    Math.max(0, Math.min(100, Math.round(score + (signals.sections >= 4 ? 5 : -5)))),
    Math.max(0, Math.min(100, Math.round(score + (signals.numbers ? 5 : -8)))),
    Math.max(0, Math.min(100, Math.round(ats))),
    Math.max(0, Math.min(100, Math.round(ats + (signals.bullets >= 3 ? 4 : -5))))
  ];
  healthBars.forEach((row, index) => {
    const bar = row.querySelector('i');
    const label = row.querySelector('b');
    if (bar) bar.style.width = `${values[index]}%`;
    if (label) label.textContent = `${values[index]}%`;
  });

  const healthSubtitle = document.getElementById('healthSubtitle');
  if (healthSubtitle) healthSubtitle.textContent = 'Based on your latest resume analysis.';

  const recommendationTitle = document.getElementById('recommendationTitle');
  const recommendationText = document.getElementById('recommendationText');
  const recommendationNum = document.querySelector('.recommendation-num');
  const recommendationSubtitle = document.getElementById('recommendationSubtitle');
  if (recommendationTitle && recommendationText) {
    recommendationTitle.textContent = analysis.improvements?.[0] ? 'Start with your top improvement' : 'Keep tailoring your resume';
    recommendationText.textContent = analysis.improvements?.[0] || 'Review the analysis below for your next improvement.';
  }
  if (recommendationNum) recommendationNum.textContent = '01';
  if (recommendationSubtitle) recommendationSubtitle.textContent = 'Based on your latest analysis.';
}

document.getElementById('analyzeButton').addEventListener('click', async function () {
  try {
    await analyzeResume();
    document.getElementById('analysisResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    notify(error.message);
  }
});

document.getElementById('matchButton').addEventListener('click', async function () {
  if (!resumeText.value.trim()) {
    notify('Add or upload your resume before matching.');
    showSection('analyze');
    return;
  }
  const title = document.getElementById('jobTitle').value.trim();
  const description = document.getElementById('jobDescription').value.trim();
  if (!description) return notify('Add a job description before matching.');

  const original = this.innerHTML;
  this.textContent = 'Matching…';
  this.disabled = true;
  try {
    const result = await api('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText: resumeText.value, jobTitle: title, jobDescription: description })
    });
    currentMatch = result;
    renderMatch(result);
    notify(`Match calculated: ${result.matchScore}%`);
  } catch (error) {
    notify(error.message);
  } finally {
    this.innerHTML = original;
    this.disabled = false;
  }
});

function renderMatch(result) {
  const card = document.getElementById('matchResult');
  card.innerHTML = `
    <p class="eyebrow light">MATCH SCORE</p>
    <div class="match-number">${escapeHtml(result.matchScore)}<span>%</span></div>
    <h3>${result.matchScore >= 80 ? 'Excellent match' : result.matchScore >= 65 ? 'Good match' : 'Partial match'}</h3>
    <p class="match-summary">${escapeHtml(result.summary)}</p>
    <div class="match-tags">${(result.matchedSkills || []).map(skill => `<span>${escapeHtml(skill)}</span>`).join('') || '<span>No strong matches found yet</span>'}</div>
    ${(result.missingKeywords || []).length ? `<p class="missing-match"><strong>Consider:</strong> ${escapeHtml(result.missingKeywords.join(', '))}</p>` : ''}
  `;
}

function updateProfileName(name) {
  const cleanName = String(name || '').trim() || 'Alex Smith';
  const firstName = cleanName.split(/\s+/)[0];
  greeting.innerHTML = `Good morning, ${escapeHtml(firstName)} <span>✦</span>`;
  const signInName = document.querySelector('#signInForm input[type="text"]');
  if (signInName && document.activeElement !== signInName) signInName.value = cleanName;
}

function loadProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem('careerlens-profile') || '{}');
    if (profile.name) profileNameInput.value = profile.name;
    if (profile.focus) careerFocusInput.value = profile.focus;
  } catch {
    // Use the defaults already in the HTML.
  }
  updateProfileName(profileNameInput.value);
}

profileNameInput.addEventListener('input', () => updateProfileName(profileNameInput.value));
profileNameInput.addEventListener('change', () => updateProfileName(profileNameInput.value));

document.querySelector('.save-profile').addEventListener('click', () => {
  const profile = { name: profileNameInput.value.trim(), focus: careerFocusInput.value.trim() };
  if (!profile.name) return notify('Enter your name before saving.');
  localStorage.setItem('careerlens-profile', JSON.stringify(profile));
  updateProfileName(profile.name);
  notify('Profile changes saved.');
});

document.getElementById('signInForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = event.currentTarget.querySelector('input[type="text"]').value.trim();
  if (name) {
    profileNameInput.value = name;
    localStorage.setItem('careerlens-profile', JSON.stringify({
      name,
      focus: careerFocusInput.value.trim()
    }));
    updateProfileName(name);
  }
  document.getElementById('authScreen').style.display = 'none';
  notify('Welcome to your local workspace.');
});

async function loadReports() {
  const list = document.querySelector('.reports-list');
  try {
    const reports = await api('/api/reports');
    list.innerHTML = reports.length
      ? reports.map(report => `<article class="report-row"><div class="file-icon">PDF</div><div><h3>${escapeHtml(report.title)}</h3><p>${new Date(report.createdAt).toLocaleDateString()} · ${escapeHtml(report.analysis?.source === 'openai' ? 'AI analysis' : 'Local analysis')}</p></div><span class="report-score">${escapeHtml(report.analysis?.resumeScore ?? '—')}</span><button class="row-button" data-delete="${escapeHtml(report.id)}">Delete</button></article>`).join('')
      : '<article class="panel"><h3>No saved reports yet</h3><p>Run an analysis to create a report history entry.</p></article>';
    list.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', async () => {
      try {
        await api(`/api/reports/${button.dataset.delete}`, { method: 'DELETE' });
        loadReports();
        notify('Report deleted.');
      } catch (error) {
        notify(error.message);
      }
    }));
  } catch (error) {
    notify(error.message);
  }
}

function resetDashboard() {
  document.querySelectorAll('.metrics-grid .metric-card').forEach((card, index) => {
    const h3 = card.querySelector('h3');
    const small = card.querySelector('small');
    if (index === 0) h3.innerHTML = '—<span>/100</span>';
    if (index === 1) h3.innerHTML = '—<span>%</span>';
    if (index === 2) h3.textContent = '—';
    if (small) small.textContent = index === 0 ? 'Upload and analyze a resume' : 'Available after analysis';
  });
  const heroScore = document.querySelector('.mini-score b');
  const heroStatus = document.querySelector('.mini-score small');
  if (heroScore) heroScore.textContent = '—';
  if (heroStatus) heroStatus.textContent = 'Upload a resume';
}

resetDashboard();
loadProfile();