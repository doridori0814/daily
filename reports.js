const path = require('path');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'codex1234';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'reports';

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function requireSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
  }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 50 * 1024 * 1024) throw new Error('PDF 파일은 50MB 이하로 올려주세요.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = /boundary=(?:(?:"([^"]+)")|([^;]+))/i.exec(contentType || '');
  if (!boundaryMatch) throw new Error('업로드 형식을 읽을 수 없습니다.');
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const parts = [];
  let start = buffer.indexOf(boundary) + boundary.length + 2;

  while (start > boundary.length) {
    const next = buffer.indexOf(boundary, start);
    if (next === -1) break;
    const raw = buffer.slice(start, next - 2);
    const headerEnd = raw.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd > -1) {
      const headerText = raw.slice(0, headerEnd).toString('latin1');
      const body = raw.slice(headerEnd + 4);
      const name = /name="([^"]+)"/i.exec(headerText)?.[1];
      const filename = /filename="([^"]*)"/i.exec(headerText)?.[1];
      const fileType = /Content-Type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim();
      if (name) parts.push({ name, filename, fileType, body });
    }
    start = next + boundary.length + 2;
  }

  const fields = {};
  const files = {};
  for (const part of parts) {
    if (part.filename) files[part.name] = part;
    else fields[part.name] = part.body.toString('utf8').trim();
  }
  return { fields, files };
}

function safeSegment(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 80) || 'research';
}

async function supabaseFetch(url, options = {}) {
  requireSupabase();
  const response = await fetch(`${SUPABASE_URL}${url}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase 요청 실패: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return response.text();
}

async function listReports(req, res) {
  const reports = await supabaseFetch('/rest/v1/reports?select=*&order=date.desc&order=type.asc');
  send(res, 200, reports.map((report) => ({
    id: report.id,
    date: report.date,
    type: report.type,
    title: report.title,
    mainComment: report.main_comment || '',
    domesticStocks: report.domestic_stocks || '',
    overseasStocks: report.overseas_stocks || '',
    majorNews: report.major_news || '',
    stocks: report.stocks || [],
    pdfPath: report.pdf_url,
    originalFilename: report.original_filename,
    updatedAt: report.updated_at,
  })));
}

async function uploadReport(req, res) {
  const body = await readBody(req);
  const { fields, files } = parseMultipart(body, req.headers['content-type']);
  if (fields.password !== ADMIN_PASSWORD) {
    return send(res, 401, { error: '관리자 비밀번호가 맞지 않습니다.' });
  }

  const type = fields.type === 'close' ? 'close' : 'morning';
  const date = fields.date || new Date().toISOString().slice(0, 10);
  const pdf = files.pdf;
  if (!pdf || !pdf.body.length) return send(res, 400, { error: 'PDF 파일을 선택해주세요.' });
  if (pdf.fileType && !pdf.fileType.includes('pdf')) {
    return send(res, 400, { error: 'PDF 파일만 업로드할 수 있습니다.' });
  }

  let stocks = [];
  try {
    stocks = JSON.parse(fields.stocks || '[]').filter((row) => row.name || row.ticker || row.note);
  } catch {
    stocks = [];
  }

  const id = `${date}-${type}`;
  const filename = `${safeSegment(date)}-${type}-${Date.now()}${path.extname(pdf.filename || '') || '.pdf'}`;
  const objectPath = `${date}/${filename}`;

  await supabaseFetch(`/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
    },
    body: pdf.body,
  });

  const pdfUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${objectPath}`;
  const row = {
    id,
    date,
    type,
    title: fields.title || (type === 'morning' ? '오전시황' : '장마감시황'),
    main_comment: fields.mainComment || '',
    domestic_stocks: fields.domesticStocks || '',
    overseas_stocks: fields.overseasStocks || '',
    major_news: fields.majorNews || '',
    stocks,
    pdf_url: pdfUrl,
    original_filename: pdf.filename || filename,
    updated_at: new Date().toISOString(),
  };

  await supabaseFetch('/rest/v1/reports?on_conflict=id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });

  send(res, 200, {
    ok: true,
    report: {
      id: row.id,
      date: row.date,
      type: row.type,
      title: row.title,
      mainComment: row.main_comment,
      domesticStocks: row.domestic_stocks,
      overseasStocks: row.overseas_stocks,
      majorNews: row.major_news,
      stocks: row.stocks,
      pdfPath: row.pdf_url,
      originalFilename: row.original_filename,
      updatedAt: row.updated_at,
    },
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return await listReports(req, res);
    if (req.method === 'POST') return await uploadReport(req, res);
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: '지원하지 않는 요청입니다.' });
  } catch (error) {
    return send(res, 500, { error: error.message || '서버 오류가 발생했습니다.' });
  }
};
