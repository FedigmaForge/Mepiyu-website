const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = path.join(__dirname, 'mepia.db');
const isNew = !fs.existsSync(DB_PATH);
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS destinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  region TEXT,
  tagline TEXT,
  description TEXT,
  image_url TEXT,
  highlights TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  duration TEXT,
  route TEXT,
  price INTEGER,
  price_note TEXT,
  includes TEXT,
  itinerary TEXT,
  image_url TEXT,
  featured INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_url TEXT NOT NULL,
  caption TEXT,
  location TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL
);
`);

try { db.exec("ALTER TABLE destinations ADD COLUMN images TEXT DEFAULT '[]'"); } catch (e) { /* column already exists */ }

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function seed() {
  const settingsCount = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
  if (settingsCount === 0) {
    const defaults = {
      site_name: 'Mepiyu Wander Travels',
      tagline: 'Explore. Dream. Discover.',
      legal_name: 'Mepiyu Wander Travels',
      whatsapp_number: '919999999999',
      contact_phone: '+91 99999 99999',
      contact_email: 'hello@mepiawandertales.com',
      contact_address: 'New Delhi, India',
      map_url: 'https://www.google.com/maps?q=32.2215492,77.1968003&z=17&hl=en',
      site_url: 'https://mepia-wander-tales.onrender.com',
      hero_heading: 'Plan your next Himalayan escape',
      hero_subheading: 'Handpicked mountain getaways across Himachal and Uttarakhand — tell us your dates, we\u2019ll build the trip.',
      about_text: 'Mepiyu Wander Travels designs small-group and custom Himalayan trips \u2014 from riverside homestays in Jibhi to snow passes above Manali. We handle the stays, the transfers and the sightseeing, so all you have to do is show up.'
    };
    const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(defaults)) stmt.run(k, v);
  }

  const destCount = db.prepare('SELECT COUNT(*) AS c FROM destinations').get().c;
  if (destCount === 0) {
    const dests = [
      ['Manali', 'Himachal Pradesh', 'Pine forests and snow passes', 'Hadimba Temple, Solang Valley, Atal Tunnel and old Manali\u2019s cafe lanes.', '', JSON.stringify(['Hadimba Temple', 'Solang Valley', 'Atal Tunnel', 'Old Manali'])],
      ['Shimla', 'Himachal Pradesh', 'The colonial hill capital', 'Mall Road, Ridge and pine-covered walks through India\u2019s old summer capital.', '', JSON.stringify(['The Ridge', 'Mall Road', 'Jakhoo Temple'])],
      ['Kasol & Manikaran', 'Himachal Pradesh (Parvati Valley)', 'Riverside villages and hot springs', 'Backpacker cafes on the Parvati river and the hot springs at Manikaran.', '', JSON.stringify(['Parvati River', 'Manikaran hot springs', 'Chalal trek'])],
      ['Jibhi', 'Himachal Pradesh (Tirthan Valley)', 'A quiet valley off the tourist trail', 'Waterfalls, deodar forests and the climb to Jalori Pass and Serolsar Lake.', '', JSON.stringify(['Jibhi Waterfall', 'Jalori Pass', 'Serolsar Lake', 'Mini Thailand'])],
      ['Tirthan Valley', 'Himachal Pradesh', 'Trout streams and riverside stays', 'Slow mornings by the Tirthan river, edged by the Great Himalayan National Park.', '', JSON.stringify(['Great Himalayan National Park', 'Riverside camping'])],
      ['Dharamshala & Dalhousie', 'Himachal Pradesh', 'Misty ridgelines and colonial charm', 'McLeod Ganj\u2019s monasteries and Dalhousie\u2019s pine-lined colonial streets.', '', JSON.stringify(['McLeod Ganj', 'Dalai Lama Temple', 'Khajjiar'])],
      ['Mussoorie', 'Uttarakhand', 'Queen of the hills', 'Mall Road views, waterfalls and easy day trips from Delhi.', '', JSON.stringify(['Kempty Falls', 'Mall Road', 'Gun Hill'])],
      ['Jim Corbett', 'Uttarakhand', 'India\u2019s oldest national park', 'Jungle safaris in search of tigers, deer and Himalayan birdlife.', '', JSON.stringify(['Jungle safari', 'Corbett Museum'])],
      ['Nainital', 'Uttarakhand', 'The lake district of the hills', 'Boating on Naini Lake, ringed by forested hills and viewpoints.', '', JSON.stringify(['Naini Lake', 'Snow View Point', 'Mall Road'])],
      ['Rohtang Pass', 'Himachal Pradesh', 'High-altitude snow pass', 'One of the most dramatic drives in the Himalayas, snow-bound most of the year.', '', JSON.stringify(['Snow point', 'Photo stops', 'Beas Kund views'])]
    ];
    const stmt = db.prepare('INSERT INTO destinations (name, region, tagline, description, image_url, highlights, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
    dests.forEach((d, i) => stmt.run(d[0], d[1], d[2], d[3], d[4], d[5], i));
  }

  const pkgCount = db.prepare('SELECT COUNT(*) AS c FROM packages').get().c;
  if (pkgCount === 0) {
    const packages = [
      {
        title: 'Jim Corbett & Mussoorie',
        duration: '4 Nights / 5 Days',
        route: 'Delhi \u2192 Jim Corbett \u2192 Mussoorie \u2192 Delhi',
        price: 10999,
        price_note: 'per person, double sharing',
        includes: JSON.stringify(['2 nights hotel stay in Jim Corbett', '2 nights hotel stay in Mussoorie', 'Daily breakfast & dinner', 'AC private cab for transfers & sightseeing', 'Delhi \u2192 Jim Corbett \u2192 Mussoorie \u2192 Delhi transfers', 'Driver allowance, parking & toll taxes']),
        itinerary: JSON.stringify([
          { day: 'Day 1', title: 'Delhi \u2192 Jim Corbett', text: 'Pickup from Delhi and drive to Jim Corbett. Check in at the hotel. Evening at leisure.' },
          { day: 'Day 2', title: 'Jim Corbett', text: 'Jungle safari and local sightseeing around Corbett.' },
          { day: 'Day 3', title: 'Jim Corbett \u2192 Mussoorie', text: 'Drive to Mussoorie and check in. Evening walk on Mall Road.' },
          { day: 'Day 4', title: 'Mussoorie sightseeing', text: 'Kempty Falls, Gun Hill and local viewpoints.' },
          { day: 'Day 5', title: 'Mussoorie \u2192 Delhi', text: 'Drive back to Delhi with drop-off.' }
        ])
      },
      {
        title: 'Manali & Shimla',
        duration: '5 Nights / 6 Days',
        route: 'Delhi \u2192 Shimla \u2192 Manali \u2192 Delhi',
        price: 11499,
        price_note: 'per person, double sharing',
        includes: JSON.stringify(['Hotel stays in Shimla & Manali', 'Daily breakfast & dinner', 'Private cab for transfers & sightseeing', 'Driver allowance, parking & toll taxes']),
        itinerary: JSON.stringify([
          { day: 'Day 1', title: 'Delhi \u2192 Shimla', text: 'Overnight journey/arrival and check-in.' },
          { day: 'Day 2', title: 'Manali local sightseeing', text: 'Hadimba Temple, Manu Temple, Vashisht, Club House, Mall Road.' },
          { day: 'Day 3', title: 'Solang Valley / Atal Tunnel / Sissu', text: 'Scenic Himalayan views en route to Solang Valley and beyond.' }
        ])
      },
      {
        title: 'Manali \u2013 Manikaran',
        duration: '4 Nights / 5 Days',
        route: 'Manali \u2192 Solang Valley \u2192 Kasol \u2192 Manikaran',
        price: 11499,
        price_note: 'per person, starting from, double sharing',
        includes: JSON.stringify(['4 nights accommodation in a good hotel', 'Daily breakfast & dinner', 'Private AC sedan for transfers & sightseeing', 'Manali local sightseeing', 'Solang Valley excursion', 'Kasol & Manikaran excursion', 'Driver allowance, parking & toll charges']),
        itinerary: JSON.stringify([
          { day: 'Day 1', title: 'Delhi \u2192 Manali', text: 'Overnight journey and check-in at hotel.' },
          { day: 'Day 2', title: 'Manali local sightseeing', text: 'Hadimba Temple, Vashisht, Mall Road.' },
          { day: 'Day 3', title: 'Solang Valley excursion', text: 'Full day at Solang Valley.' },
          { day: 'Day 4', title: 'Kasol & Manikaran', text: 'Parvati river, cafes and the Manikaran hot springs.' }
        ])
      },
      {
        title: 'Jibhi Getaway',
        duration: '3 Nights / 4 Days',
        route: 'Delhi \u2192 Jibhi \u2192 Delhi',
        price: 9499,
        price_note: 'per person, double sharing',
        includes: JSON.stringify(['Homestay/hotel accommodation', 'Daily breakfast & dinner', 'Private cab for transfers & sightseeing', 'Driver allowance, parking & toll charges']),
        itinerary: JSON.stringify([
          { day: 'Day 1', title: 'Delhi \u2192 Jibhi', text: 'Overnight journey/arrival in Jibhi. Check-in at hotel/homestay.' },
          { day: 'Day 2', title: 'Jibhi local sightseeing', text: 'Jibhi Waterfall, Jibhi Village, Mini Thailand, Jalori Pass (subject to road/weather conditions), Serolsar Lake.' },
          { day: 'Day 3', title: 'Leisure / optional trek', text: 'Free morning, optional short trek, evening by the river.' }
        ])
      },
      {
        title: 'Nainital Escape',
        duration: '4 Nights / 5 Days',
        route: 'Delhi \u2192 Nainital \u2192 Delhi',
        price: 9999,
        price_note: 'per person, double sharing',
        includes: JSON.stringify(['Hotel stay in Nainital', 'Daily breakfast & dinner', 'Private cab for transfers & sightseeing', 'Driver allowance, parking & toll charges']),
        itinerary: JSON.stringify([
          { day: 'Day 1', title: 'Delhi \u2192 Nainital', text: 'Drive to Nainital and check in.' },
          { day: 'Day 2', title: 'Nainital sightseeing', text: 'Naini Lake boating, Snow View Point, Mall Road.' }
        ])
      }
    ];
    const stmt = db.prepare('INSERT INTO packages (title, duration, route, price, price_note, includes, itinerary, image_url, featured, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    packages.forEach((p, i) => stmt.run(p.title, p.duration, p.route, p.price, p.price_note, p.includes, p.itinerary, '', i === 1 ? 1 : 0, i));
  }

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c;
  if (userCount === 0) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword('mepia@admin1', salt);
    db.prepare('INSERT INTO admin_users (username, salt, hash) VALUES (?, ?, ?)').run('admin', salt, hash);
    console.log('Created default admin user -> username: admin | password: mepia@admin1 (change this after first login)');
  }
}

seed();

module.exports = { db, hashPassword };
