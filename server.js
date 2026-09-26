const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const rootPrefix = `${root}${path.sep}`;
const dataDirectory = path.join(root, 'data');
const reportsFile = path.join(dataDirectory, 'reports.json');
const maxBodyBytes = 11 * 1024 * 1024; // 10 MB file + multipart request overhead
const staticTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', ...headers });
  response.end(body);
}

function sendJson(response, status, value) {
  send(response, status, JSON.stringify(value), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
}

function cleanText(value, maxLength = 30000) {
  return typeof value === 'string'
    ? value.replace(/\0/g, '').replace(/\r\n/g, '\n').trim().slice(0, maxLength)
    : '';
}

// PDF files can contain a text layer whose font encoding maps characters to
// private glyphs. pdf-parse may return visually meaningless symbols even
// though the PDF is technically text-based. Detect that case and let the
// browser OCR path handle the original PDF instead of putting gibberish into
// the resume text box.
function isReadableResumeText(value) {
  const text = cleanText(value);
  if (text.length < 40) return false;
  const letters = (text.match(/[\p{L}]/gu) || []).length;
  const words = (text.match(/[\p{L}]{2,}/gu) || []).length;
  const replacementChars = (text.match(/[�□]/g) || []).length;
  const strangeChars = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  const letterRatio = letters / Math.max(text.length, 1);
  if (replacementChars > 2 || strangeChars > 2) return false;
  if (words < 6) return false;
  return letterRatio >= 0.22;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    request.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBodyBytes) {
        settled = true;
        reject(new Error('The request is larger than 10 MB.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!settled) resolve(Buffer.concat(chunks));
    });
    request.on('error', error => {
      if (!settled) reject(error);
    });
  });
}

async function readJson(request) {
  try {
    return JSON.parse((await readBody(request)).toString('utf8') || '{}');
  } catch {
    throw new Error('Invalid JSON request.');
  }
}

async function getReports() {
  try {
    const parsed = JSON.parse(await fs.readFile(reportsFile, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveReports(reports) {
  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.writeFile(reportsFile, JSON.stringify(reports, null, 2), 'utf8');
}

const STOP_WORDS = new Set([
  'about','after','again','also','and','are','been','being','between','both','but','can','could','create',
  'customer','customers','design','does','each','for','from','have','into','looking','make','more','most',
  'not','our','out','role','that','their','they','this','through','using','with','work','your','you','will',
  'the','a','an','to','of','in','on','as','at','by','or','is','it','we','i','be','was','were','has','had'
]);

const SKILL_ALIASES = {
  javascript: ['javascript', 'js'],
  typescript: ['typescript', 'ts'],
  python: ['python'],
  java: ['java'],
  react: ['react', 'react.js', 'reactjs'],
  node: ['node', 'node.js', 'nodejs'],
  sql: ['sql', 'mysql', 'postgresql', 'postgres'],
  mongodb: ['mongodb', 'mongo'],
  aws: ['aws', 'amazon web services'],
  azure: ['azure'],
  gcp: ['gcp', 'google cloud'],
  docker: ['docker'],
  kubernetes: ['kubernetes', 'k8s'],
  git: ['git', 'github', 'gitlab'],
  'machine learning': ['machine learning', 'ml'],
  'deep learning': ['deep learning'],
  'natural language processing': ['natural language processing', 'nlp'],
  'computer vision': ['computer vision'],
  tensorflow: ['tensorflow'],
  pytorch: ['pytorch'],
  pandas: ['pandas'],
  numpy: ['numpy'],
  figma: ['figma'],
  'product design': ['product design'],
  'user research': ['user research'],
  'design systems': ['design systems'],
  prototyping: ['prototyping', 'prototype'],
  'data analysis': ['data analysis', 'data analytics'],
  excel: ['excel', 'microsoft excel'],
  tableau: ['tableau'],
  powerbi: ['power bi', 'powerbi'],
  communication: ['communication', 'communicate'],
  leadership: ['leadership', 'lead'],
  teamwork: ['teamwork', 'collaboration', 'collaborate']
};

function normalize(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9+#.\-\s]/g, ' ');
}

function keywords(text) {
  return [...new Set((normalize(text).match(/[a-z][a-z0-9+#.\-]{2,}/g) || []).filter(word => !STOP_WORDS.has(word)))];
}

function containsTerm(text, term) {
  const source = normalize(text);
  return source.includes(term.includes(' ') ? term : ` ${term} `) || source.includes(term);
}

function detectSkills(text) {
  const source = normalize(text);
  return Object.entries(SKILL_ALIASES)
    .filter(([, aliases]) => aliases.some(alias => source.includes(alias)))
    .map(([name]) => name);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function calculateScores(resumeText, jobDescription = '') {
  const resume = normalize(resumeText);
  const job = normalize(jobDescription);
  const resumeKeywords = new Set(keywords(resumeText));
  const jobKeywords = keywords(jobDescription);
  const resumeSkills = detectSkills(resumeText);
  const jobSkills = detectSkills(jobDescription);
  const matchedSkills = jobSkills.filter(skill => resumeSkills.includes(skill));
  const missingSkills = jobSkills.filter(skill => !resumeSkills.includes(skill));
  const matchedKeywords = jobKeywords.filter(term => resumeKeywords.has(term));
  const uniqueMatchedKeywords = unique(matchedKeywords).slice(0, 12);
  const uniqueMissingKeywords = unique(jobKeywords.filter(term => !resumeKeywords.has(term))).slice(0, 10);

  const matchedPhrases = matchedSkills.filter(skill => skill.includes(' '));
  const phraseTokens = new Set(matchedPhrases.flatMap(skill => skill.split(/\s+/)));
  const filteredMissingKeywords = unique(jobKeywords.filter(term => !resumeKeywords.has(term) && !phraseTokens.has(term)));
  const numbers = [...resume].filter(char => char >= '0' && char <= '9').length > 0 ? 1 : 0;
  const bullets = (resume.match(/(^|\n)\s*[•\-*]/g) || []).length;
  const sections = ['experience', 'education', 'skills', 'projects', 'summary', 'certifications'].filter(section => containsTerm(resume, section));
  const actionVerbs = ['built','created','developed','designed','led','improved','increased','reduced','automated','implemented','analyzed','launched','optimized','managed','delivered','engineered','deployed'];
  const actionCount = actionVerbs.filter(verb => containsTerm(resume, verb)).length;

  const keywordRatio = jobKeywords.length ? uniqueMatchedKeywords.length / Math.min(jobKeywords.length, 25) : 0.35;
  const skillRatio = jobSkills.length ? matchedSkills.length / jobSkills.length : Math.min(0.75, resumeSkills.length / 12);
  const structureScore = Math.min(1, sections.length / 5);
  const impactScore = Math.min(1, numbers / 5);
  const actionScore = Math.min(1, actionCount / 6);

  let resumeScore = Math.round(42 + keywordRatio * 18 + skillRatio * 18 + structureScore * 8 + impactScore * 8 + actionScore * 6);
  if (!jobDescription.trim()) resumeScore = Math.round(55 + structureScore * 15 + impactScore * 12 + actionScore * 8 + Math.min(resumeSkills.length, 10) * 1.2);
  resumeScore = Math.max(35, Math.min(97, resumeScore));

  const atsScore = Math.max(40, Math.min(98, Math.round(55 + structureScore * 15 + keywordRatio * 18 + (bullets > 2 ? 5 : 0) + (numbers > 0 ? 5 : 0))));
  const matchScore = Math.max(30, Math.min(98, Math.round(45 + keywordRatio * 25 + skillRatio * 30 + (numbers > 0 ? 3 : 0))));

  return {
    resumeScore,
    atsScore,
    matchScore,
    matchedSkills: unique([...matchedSkills, ...uniqueMatchedKeywords]).slice(0, 10),
    missingKeywords: unique([...missingSkills, ...filteredMissingKeywords]).slice(0, 8),
    signals: { numbers, bullets, sections: sections.length, actionCount, resumeSkills: resumeSkills.length, jobSkills: jobSkills.length },
    resumeSkills,
    jobSkills
  };
}

function localAnalysis(resumeText, jobDescription) {
  const scores = calculateScores(resumeText, jobDescription);
  const { numbers, bullets, sections, actionCount } = scores.signals;
  const strengths = [];
  const improvements = [];

  if (numbers >= 3) strengths.push(`Uses ${numbers} measurable figures, giving recruiters clearer evidence of impact.`);
  else strengths.push('Contains experience details that can be made more persuasive with measurable outcomes.');
  if (sections >= 4) strengths.push(`Uses ${sections} recognizable resume sections, which supports quick scanning.`);
  else strengths.push('Has a workable structure; adding standard sections can make the document easier to scan.');
  if (scores.matchedSkills.length) strengths.push(`Matches ${scores.matchedSkills.length} relevant role terms or skills.`);
  else strengths.push('Provides a useful base that can be tailored to the target role.');

  if (numbers < 3) improvements.push('Add measurable outcomes to 2–3 experience or project bullets, such as percentages, users, time saved, or revenue influenced.');
  else improvements.push('Add one more measurable outcome to a recent achievement so the impact is consistent across experience bullets.');
  if (scores.missingKeywords.length && jobDescription.trim()) improvements.push(`Review these missing terms and add only those that genuinely match your experience: ${scores.missingKeywords.slice(0, 5).join(', ')}.`);
  else if (jobDescription.trim()) improvements.push('Tailor the summary and skills section to the exact language used in the target job description.');
  if (actionCount < 4 || bullets < 3) improvements.push('Start bullets with strong action verbs and keep each bullet focused on one clear outcome.');
  else improvements.push('Keep action-led bullets concise and lead with the strongest result first.');

  return {
    source: 'local',
    resumeScore: scores.resumeScore,
    atsScore: scores.atsScore,
    matchedSkills: scores.matchedSkills,
    missingKeywords: scores.missingKeywords,
    strengths: unique(strengths).slice(0, 4),
    improvements: unique(improvements).slice(0, 4),
    summary: jobDescription.trim()
      ? `This review compares your resume with the supplied job description and evaluates keywords, skills, structure, action language, and measurable impact. Current target-role match: ${scores.matchScore}%.`
      : 'This review evaluates resume structure, skills, action language, and measurable impact. Add a job description for a target-role match.'
  };
}

async function openAiAnalysis(resumeText, jobDescription) {
  const prompt = `Review this resume and optional job description as a supportive career coach. Do not invent qualifications. Return only valid JSON with keys resumeScore (number 0-100), atsScore (number 0-100), matchScore (number 0-100), matchedSkills (array of strings), missingKeywords (array of strings), strengths (array of strings), improvements (array of strings), and summary (string). Make the result specific to the supplied resume; do not reuse generic scores or recommendations when the input changes.\n\nRESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription || 'Not provided'}`;
  const result = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5', input: prompt, store: false })
  });
  if (!result.ok) throw new Error('The AI service could not complete the review. Check your API key and model setting.');
  const response = await result.json();
  let raw = response.output_text || '';
  if (!raw) {
    raw = (response.output || []).flatMap(item => item.content || []).map(item => item.text || '').join('');
  }
  raw = raw.replace(/^```json\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(raw);
  return {
    ...parsed,
    matchScore: Number.isFinite(Number(parsed.matchScore)) ? Number(parsed.matchScore) : undefined,
    source: 'openai'
  };
}

function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) throw new Error('Missing upload boundary.');
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  let cursor = 0;

  while (cursor < buffer.length) {
    const start = buffer.indexOf(boundary, cursor);
    if (start === -1) break;
    const headerStart = start + boundary.length;
    if (buffer.slice(headerStart, headerStart + 2).toString() === '--') break;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) break;

    const headers = buffer.slice(headerStart, headerEnd).toString('utf8');
    const nextBoundary = buffer.indexOf(boundary, headerEnd + 4);
    if (nextBoundary === -1) break;
    const bodyEnd = nextBoundary - 2;
    const body = buffer.slice(headerEnd + 4, bodyEnd);
    const fileMatch = /filename="([^"]*)"/i.exec(headers);
    if (fileMatch && fileMatch[1]) {
      return { fileName: path.basename(fileMatch[1]), buffer: body };
    }
    cursor = nextBoundary;
  }
  throw new Error('No file was received.');
}

function decodePdfLiteral(value) {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch !== '\\') { out += ch; continue; }
    const next = value[++i];
    if (next === undefined) break;
    const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
    if (simple[next]) { out += simple[next]; continue; }
    if (/^[0-7]$/.test(next)) {
      let oct = next;
      while (oct.length < 3 && i + 1 < value.length && /^[0-7]$/.test(value[i + 1])) oct += value[++i];
      out += String.fromCharCode(parseInt(oct, 8));
      continue;
    }
    out += next;
  }
  return out;
}

function decodePdfHex(value) {
  const hex = value.replace(/\s+/g, '');
  const even = hex.length % 2 ? `${hex}0` : hex;
  const bytes = Buffer.from(even, 'hex');
  // PDF hex strings are commonly UTF-16BE when they start with FE FF.
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    const chars = [];
    for (let i = 2; i + 1 < bytes.length; i += 2) chars.push(String.fromCharCode(bytes.readUInt16BE(i)));
    return chars.join('');
  }
  return bytes.toString('latin1');
}

function extractPdfTextFallback(buffer) {
  const source = buffer.toString('latin1');
  const chunks = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;

  while ((match = streamPattern.exec(source))) {
    const raw = Buffer.from(match[1], 'latin1');
    let data = raw;
    const objectStart = Math.max(0, match.index - 1200);
    const dictionary = source.slice(objectStart, match.index);
    if (/\/FlateDecode\b/.test(dictionary)) {
      try { data = zlib.inflateSync(raw); }
      catch (_) { try { data = zlib.inflateRawSync(raw); } catch (_) { data = raw; } }
    }
    const text = data.toString('latin1');
    if (/\bBT\b[\s\S]*?\bET\b/.test(text)) chunks.push(text);
  }

  // Some very simple PDFs contain uncompressed operators and may not have a stream match.
  if (!chunks.length) chunks.push(source);

  const output = [];
  const operators = /\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:.|\r|\n)*?)\]\s*TJ|<([0-9A-Fa-f\s]+)>\s*Tj/g;
  for (const chunk of chunks) {
    let m;
    while ((m = operators.exec(chunk))) {
      if (m[1] !== undefined) {
        output.push(decodePdfLiteral(m[1]));
      } else if (m[2] !== undefined) {
        const items = m[2].match(/\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>/g) || [];
        for (const item of items) {
          if (item.startsWith('(')) output.push(decodePdfLiteral(item.slice(1, -1)));
          else output.push(decodePdfHex(item.slice(1, -1)));
        }
        output.push('\n');
      } else {
        output.push(decodePdfHex(m[3]));
      }
    }
  }

  return output.join(' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

async function extractResume(request) {
  const { fileName, buffer } = parseMultipart(await readBody(request), request.headers['content-type']);
  const extension = path.extname(fileName).toLowerCase();
  if (!['.pdf', '.docx'].includes(extension)) throw new Error('Upload a PDF or DOCX file.');
  if (!buffer.length) throw new Error('The uploaded file is empty.');
  if (buffer.length > maxBodyBytes) throw new Error('The file must be 10 MB or smaller.');

  try {
    let text = '';
    if (extension === '.pdf') {
      // First use pdf-parse. If it fails on a PDF produced by a newer/less common
      // PDF generator, fall back to a small built-in PDF text-stream extractor.
      try {
        const pdf = require('pdf-parse');
        text = (await pdf(buffer)).text || '';
      } catch (_) {
        text = '';
      }
      if (!isReadableResumeText(text)) text = extractPdfTextFallback(buffer);
      // The fallback extractor is intentionally conservative. If the PDF uses
      // a custom font encoding, its character codes can still be unreadable.
      // Return the OCR trigger instead of ever exposing corrupted text to the UI.
      if (!isReadableResumeText(text)) {
        const error = new Error('The PDF text encoding is not readable.');
        error.code = 'PDF_TEXT_MISSING';
        throw error;
      }
    } else {
      const mammoth = require('mammoth');
      text = (await mammoth.extractRawText({ buffer })).value;
    }
    text = cleanText(text);
    if (text.length < 40) {
      const error = new Error('This PDF does not contain a readable text layer.');
      error.code = 'PDF_TEXT_MISSING';
      throw error;
    }
    return { fileName, text, characters: text.length };
  } catch (error) {
    if (error.code === 'PDF_TEXT_MISSING') throw error;
    throw new Error('The PDF/DOCX could not be read. Please try another file.');
  }
}

function pdfEscape(text) {
  return String(text).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7E]/g, '');
}

function createPdf(title, lines) {
  const stream = [`BT /F1 18 Tf 50 760 Td (${pdfEscape(title)}) Tj /F1 10 Tf 0 -30 Td`];
  lines.flatMap(line => String(line).match(/.{1,88}(?:\s|$)|\S+?(?:\s|$)/g) || ['']).slice(0, 44).forEach(line => {
    stream.push(`(${pdfEscape(line.trim())}) Tj 0 -15 Td`);
  });
  stream.push('ET');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream.join('\n'))} >>\nstream\n${stream.join('\n')}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  return Buffer.from(`${pdf}xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}

async function api(request, response, pathname) {
  if (pathname === '/api/upload' && request.method === 'POST') {
    return sendJson(response, 200, await extractResume(request));
  }

  if (pathname === '/api/analyze' && request.method === 'POST') {
    const { resumeText, jobDescription } = await readJson(request);
    const resume = cleanText(resumeText);
    const job = cleanText(jobDescription);
    if (resume.length < 40) return sendJson(response, 400, { error: 'Add at least 40 characters of resume text before analyzing.' });

    let analysis;
    if (process.env.OPENAI_API_KEY) {
      try {
        analysis = await openAiAnalysis(resume, job);
      } catch (error) {
        analysis = localAnalysis(resume, job);
        analysis.aiFallback = true;
        analysis.aiError = error.message;
      }
    } else {
      analysis = localAnalysis(resume, job);
    }
    return sendJson(response, 200, analysis);
  }

  if (pathname === '/api/match' && request.method === 'POST') {
    const { resumeText, jobTitle, jobDescription } = await readJson(request);
    const resume = cleanText(resumeText);
    const title = cleanText(jobTitle, 160);
    const job = cleanText(jobDescription);
    if (resume.length < 40) return sendJson(response, 400, { error: 'Add or upload your resume before matching.' });
    if (job.length < 20) return sendJson(response, 400, { error: 'Add a job description before matching.' });

    const scores = calculateScores(resume, job);
    const matchTitle = title || 'Target role';
    return sendJson(response, 200, {
      jobTitle: matchTitle,
      matchScore: scores.matchScore,
      matchedSkills: scores.matchedSkills.slice(0, 6),
      missingKeywords: scores.missingKeywords.slice(0, 6),
      summary: scores.matchScore >= 80
        ? `Strong alignment with ${matchTitle}. Your resume already covers several of the role's core terms.`
        : scores.matchScore >= 65
          ? `Good starting alignment with ${matchTitle}. A few targeted changes could improve your fit.`
          : `This role is a partial match. Tailor your resume around the strongest relevant skills before applying.`
    });
  }

  if (pathname === '/api/reports' && request.method === 'GET') return sendJson(response, 200, await getReports());

  if (pathname === '/api/reports' && request.method === 'POST') {
    const { title, analysis } = await readJson(request);
    if (!analysis || typeof analysis !== 'object') return sendJson(response, 400, { error: 'A valid analysis is required.' });
    const reports = await getReports();
    const report = {
      id: crypto.randomUUID(),
      title: cleanText(title, 100) || 'Resume analysis',
      analysis,
      createdAt: new Date().toISOString()
    };
    reports.unshift(report);
    await saveReports(reports.slice(0, 50));
    return sendJson(response, 201, report);
  }

  if (pathname.startsWith('/api/reports/') && request.method === 'DELETE') {
    const reports = await getReports();
    await saveReports(reports.filter(report => report.id !== pathname.split('/').pop()));
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === '/api/report.pdf' && request.method === 'POST') {
    const { title, analysis } = await readJson(request);
    const lines = [
      `Resume score: ${analysis?.resumeScore ?? 'N/A'}/100`,
      `ATS compatibility: ${analysis?.atsScore ?? 'N/A'}%`,
      '', 'Summary', analysis?.summary || '', '',
      'Strengths', ...(analysis?.strengths || []), '',
      'Recommended improvements', ...(analysis?.improvements || [])
    ];
    return send(response, 200, createPdf(cleanText(title, 80) || 'CareerLens report', lines), {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="careerlens-report.pdf"',
      'Cache-Control': 'no-store'
    });
  }

  return sendJson(response, 404, { error: 'API route not found.' });
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    if (pathname.startsWith('/api/')) return await api(request, response, pathname);
    if (!['GET', 'HEAD'].includes(request.method)) return send(response, 405, 'Method not allowed');
    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(root, requested);
    if (!filePath.startsWith(rootPrefix) || requested.split(/[\\/]/).some(part => part.startsWith('.'))) return send(response, 403, 'Forbidden');
    const content = await fs.readFile(filePath);
    return send(response, 200, request.method === 'HEAD' ? '' : content, {
      'Content-Type': staticTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
  } catch (error) {
    const status = /10 MB/.test(error.message) ? 413 : /Invalid|Add at least|Upload|read|received|empty|job description/.test(error.message) ? 400 : 500;
    sendJson(response, status, { error: error.message || 'Unexpected server error.' });
  }
});

function startServer(startPort) {
  server.once('error', error => {
    if (error.code === 'EADDRINUSE' && startPort < port + 10) {
      const nextPort = startPort + 1;
      console.log(`Port ${startPort} is already in use. Trying port ${nextPort}…`);
      startServer(nextPort);
      return;
    }
    console.error('Could not start CareerLens:', error);
    process.exitCode = 1;
  });

  server.listen(startPort, () => {
    console.log(`CareerLens is running at http://localhost:${startPort}`);
  });
}

startServer(port);