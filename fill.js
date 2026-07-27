import { PDFDocument } from 'pdf-lib';
import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer();

app.use(express.static('public'));
app.use(express.json());

// ---- FIELD MAPPING (edit these to match the real field names in your PDFs) ----
const FIELD_MAP = {
  // Common fields that appear on every form
  fullName: ['FullName', 'ApplicantName', 'Name', 'ClientName'],
  ssn: ['SSN', 'SocialSecurityNumber'],
  dob: ['DOB', 'DateOfBirth'],
  address: ['Address', 'StreetAddress'],
  city: ['City'],
  state: ['State'],
  zip: ['Zip', 'ZipCode'],
  phone: ['Phone', 'PhoneNumber'],
  email: ['Email'],
  caseNumber: ['CaseNumber', 'CaseID'],
  // Program-specific example fields
  programAReason: ['ReasonForRequest', 'ProgramA_Reason'],
  programBSystem: ['SystemNeeded', 'ProgramB_System'],
  programCDate: ['RequestedStartDate']
};

// Which forms each program needs
const PROGRAM_FORMS = {
  A: 'ProgramA.pdf',
  B: 'ProgramB.pdf',
  C: 'ProgramC.pdf'
};

async function fillOneForm(templatePath, data) {
  const bytes = await fs.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();

  // Try every possible field name for each piece of data
  for (const [key, value] of Object.entries(data)) {
    if (!value) continue;
    const possibleNames = FIELD_MAP[key] || [key];
    for (const name of possibleNames) {
      try {
        const field = form.getTextField(name);
        field.setText(String(value));
        break; // stop after first successful match
      } catch (e) {
        // field doesn't exist on this form – ignore
      }
    }
  }

  // Optional: flatten so fields become static text
  // form.flatten();

  return await pdfDoc.save();
}

app.post('/generate', async (req, res) => {
  try {
    const {
      requestType,          // "new" | "reinstatement"
      programs,             // ["A"] or ["B","C"] etc.
      fullName, ssn, dob, address, city, state, zip, phone, email, caseNumber,
      extra = {}            // any program-specific fields
    } = req.body;

    // Decide which forms to generate
    let formsToFill = [];
    if (requestType === 'new') {
      formsToFill = ['A', ...programs.filter(p => p !== 'A')]; // always include A
    } else {
      formsToFill = programs; // only the ones they need
    }

    const data = { fullName, ssn, dob, address, city, state, zip, phone, email, caseNumber, ...extra };
    const results = [];

    for (const prog of formsToFill) {
      const template = path.join(__dirname, 'forms', PROGRAM_FORMS[prog]);
      const filledBytes = await fillOneForm(template, data);
      const fileName = `${fullName.replace(/\s+/g, '_')}_${prog}_${requestType}.pdf`;
      results.push({
        program: prog,
        fileName,
        base64: Buffer.from(filledBytes).toString('base64')
      });
    }

    res.json({ success: true, files: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Form Worksheet running → http://localhost:${PORT}`);
});
