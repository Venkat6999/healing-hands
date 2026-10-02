/* Add the "Digital partner" block to the home page schema and to the default
   content, so the fields appear in the admin panel with the right names.

   Keys continue the existing numbering: index.t125/t126 for text,
   index.img125 for the logo and index.img125alt for its alt text. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SCHEMA = path.join(ROOT, 'data', 'content-schema.json');
const DEFAULT = path.join(ROOT, 'data', 'content.default.json');
const LIVE = path.join(ROOT, 'data', 'content.json');

const GROUP_ID = 'index-digital-partner';
const FIELDS = [
  { key: 'index.t125', type: 'text', label: 'Section label' },
  { key: 'index.t126', type: 'text', label: 'Digital partner name' },
  { key: 'index.img125', type: 'image', label: 'Digital partner logo' },
  { key: 'index.img125alt', type: 'text', label: 'Logo description (alt text)' }
];

const VALUES = {
  'index.t125': 'Digital partner',
  'index.t126': 'A+ Tech Services',
  'index.img125': 'images/Aplus-logo.png',
  'index.img125alt': 'A+ Tech Services logo'
};

function patch(file, isSchema) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (isSchema) {
    const page = doc.find((p) => p.file === 'index.html');
    if (!page) throw new Error('index page not found in the schema');
    if (page.groups.some((g) => g.id === GROUP_ID)) {
      console.log('  schema: group already present, skipping');
      return;
    }
    page.groups.push({ id: GROUP_ID, label: 'Digital partner', fields: FIELDS });
    fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    console.log('  schema: added group "' + GROUP_ID + '" with ' + FIELDS.length + ' fields');
  } else {
    Object.assign(doc, VALUES);
    fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    console.log('  ' + path.basename(file) + ': set ' + Object.keys(VALUES).length + ' default values');
  }
}

console.log('\n  Adding the Digital partner block\n');
patch(SCHEMA, true);
patch(DEFAULT, false);
patch(LIVE, false);
console.log('');