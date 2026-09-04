/**
 * Ménage — backend Apps Script
 *
 * Lancer setup() UNE FOIS depuis l'éditeur, puis déployer en application web
 * (Exécuter en tant que : moi / Accès : tout le monde disposant du lien).
 */

var PROP = PropertiesService.getScriptProperties();
var JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/* ------------------------------------------------------------------ setup */

function setup() {
  var ss = SpreadsheetApp.create('Ménage — base de données');
  PROP.setProperty('SS_ID', ss.getId());

  var t = ss.getActiveSheet().setName('Taches');
  t.getRange(1, 1, 1, 8)
    .setValues([['id', 'nom', 'zone', 'qui', 'duree', 'mode', 'regle', 'actif']])
    .setFontWeight('bold');
  t.setFrozenRows(1);
  t.getRange(2, 1, 5, 8).setValues([
    ['t1', 'Brosser le chien', 'Salon', '', 10, 'jours', 'lun,jeu', true],
    ['t2', 'Vider le lave-vaisselle', 'Cuisine', '', 5, 'jours', 'lun,mar,mer,jeu,ven,sam,dim', true],
    ['t3', 'Sortir les poubelles', 'Extérieur', 'Antho', 5, 'jours', 'mar,ven', true],
    ['t4', 'Relever les compteurs', 'Extérieur', 'Antho', 10, 'mois', '1', true],
    ['t5', 'Détartrer la douche', 'Salle de bain', '', 20, 'intervalle', '14', true]
  ]);

  var j = ss.insertSheet('Journal');
  j.getRange(1, 1, 1, 5)
    .setValues([['horodatage', 'id', 'date', 'qui', 'retard']])
    .setFontWeight('bold');
  j.setFrozenRows(1);

  var c = ss.insertSheet('Config');
  c.getRange(1, 1, 1, 2).setValues([['cle', 'valeur']]).setFontWeight('bold');
  c.getRange(2, 1, 12, 2).setValues([
    ['personnes', 'Antho,Alexandra'],
    ['destinataires', Session.getActiveUser().getEmail()],
    ['mail_quotidien', 'oui'],
    ['mail_soir', 'non'],
    ['mail_hebdo', 'oui'],
    ['mail_mensuel', 'oui'],
    ['vacances', 'non'],
    ['heure_matin', '7'],
    ['heure_soir', '19'],
    ['heure_envoi', '7'],
    ['verrou_jours', '2'],
    ['sauvegarde_hebdo', 'oui']
  ]);

  pushSheet_();
  snoozeSheet_();
  vapidKeys_();
  jeton_();
  installerDeclencheurs();
  Logger.log('Base créée : ' + ss.getUrl());
  Logger.log('Jeton d\'accès : ' + jeton_());
  return ss.getUrl();
}

function installerDeclencheurs() {
  ScriptApp.getProjectTriggers().forEach(function (tr) { ScriptApp.deleteTrigger(tr); });
  var c = config();
  var hm = parseInt(c.heure_matin || c.heure_envoi || '7', 10);
  var hs = parseInt(c.heure_soir || '19', 10);
  ScriptApp.newTrigger('digestMatin').timeBased().everyDays(1).atHour(hm).create();
  ScriptApp.newTrigger('digestSoir').timeBased().everyDays(1).atHour(hs).create();
  ScriptApp.newTrigger('mailHebdo').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(hm).create();
  ScriptApp.newTrigger('mailMensuel').timeBased().onMonthDay(1).atHour(hm).create();
  ScriptApp.newTrigger('sauvegarde').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
}

/* copie datée du Sheet dans un dossier "sauvegardes" à côté du Sheet, garde les 4 dernières */
function sauvegarde() {
  if (String(config().sauvegarde_hebdo || 'oui').toLowerCase() === 'non') return;
  var src = DriveApp.getFileById(PROP.getProperty('SS_ID'));
  var parents = src.getParents();
  var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var dossiers = parent.getFoldersByName('Ménage — sauvegardes');
  var dossier = dossiers.hasNext() ? dossiers.next() : parent.createFolder('Ménage — sauvegardes');
  var nom = 'Ménage ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  src.makeCopy(nom, dossier);
  var copies = [];
  var it = dossier.getFiles();
  while (it.hasNext()) copies.push(it.next());
  copies.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  copies.slice(4).forEach(function (f) { f.setTrashed(true); });
}

/**
 * À lancer UNE FOIS pour ranger le Sheet, le projet Apps Script et le dossier
 * de sauvegardes dans Famille/Antho/tableau/Ménage (les dossiers manquants sont
 * créés). Modifie le tableau CHEMIN ci-dessous pour un autre emplacement, ou
 * retire 'Ménage' pour ranger directement dans "tableau".
 */
function rangerFichiers() {
  var CHEMIN = ['Famille', 'Antho', 'tableau', 'Ménage'];
  var parent = DriveApp.getRootFolder();
  CHEMIN.forEach(function (nom) {
    var it = parent.getFoldersByName(nom);
    parent = it.hasNext() ? it.next() : parent.createFolder(nom);
  });
  DriveApp.getFileById(PROP.getProperty('SS_ID')).moveTo(parent);
  DriveApp.getFileById(ScriptApp.getScriptId()).moveTo(parent);
  var bk = DriveApp.getFoldersByName('Ménage — sauvegardes');
  if (bk.hasNext()) bk.next().moveTo(parent);
  Logger.log('Rangé dans ' + parent.getName() + ' — ' + parent.getUrl());
}

/**
 * À lancer UNE FOIS après avoir collé une nouvelle version de Code.gs.
 * Idempotent : sans danger si relancé. Ne recrée jamais la base (contrairement à setup()).
 */
function migrer() {
  var ss = ss_();
  // la colonne "regle" doit rester du texte, sinon Sheets convertit "2026-09-15" en date
  ss.getSheetByName('Taches').getRange('G:G').setNumberFormat('@');
  // nouvelles clés de config (ne touche pas à celles qui existent déjà)
  [['mail_soir', 'non'], ['heure_matin', config().heure_envoi || '7'], ['heure_soir', '19'],
   ['verrou_jours', '2'], ['sauvegarde_hebdo', 'oui']]
    .forEach(function (kv) { if (config()[kv[0]] === undefined) setConfig_(kv[0], kv[1]); });
  pushSheet_();
  snoozeSheet_();
  vapidKeys_();
  installerDeclencheurs();
  Logger.log('Migration OK — JETON D\'ACCÈS : ' + jeton_() +
    '  (à coller dans l\'app > Réglages > Jeton, ou utiliser « Partager le lien »)');
  Logger.log('Clé VAPID publique : ' + vapidKeys_().pub);
  Logger.log('Fuseau du script : ' + Session.getScriptTimeZone() +
    ' (à régler sur Europe/Paris dans Projet > Paramètres si les rappels arrivent à la mauvaise heure)');
}

/* ------------------------------------------------------------- accès Sheet */

function ss_() {
  var id = PROP.getProperty('SS_ID');
  if (!id) throw new Error('Lancez setup() une première fois.');
  return SpreadsheetApp.openById(id);
}

function lire_(nom) {
  var v = ss_().getSheetByName(nom).getDataRange().getValues();
  var head = v.shift();
  return v.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    var o = {};
    head.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

function config() {
  var o = {};
  lire_('Config').forEach(function (r) { o[r.cle] = String(r.valeur); });
  return o;
}

function ymd_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function parseYmd_(s) {
  var p = String(s).split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

/* ------------------------------------------------------------------- API */

function jeton_() {
  var t = PROP.getProperty('JETON');
  if (!t) { t = Utilities.getUuid().replace(/-/g, ''); PROP.setProperty('JETON', t); }
  return t;
}

/* à lancer si le jeton fuite : génère-en un nouveau (à recoller dans l'app + le lien) */
function nouveauJeton() {
  var t = Utilities.getUuid().replace(/-/g, '');
  PROP.setProperty('JETON', t);
  Logger.log('Nouveau jeton : ' + t);
  return t;
}

function doGet(e) {
  var p = e.parameter || {};
  var out;
  try {
    if (String(p.jeton || '') !== jeton_()) throw new Error('Accès refusé — jeton invalide');
    out = { ok: true, data: router_(p.action || 'data', p) };
  } catch (err) {
    out = { ok: false, erreur: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  return doGet({ parameter: JSON.parse(e.postData.contents) });
}

function router_(action, p) {
  switch (action) {
    case 'data': return paquet_();
    case 'toggle': return toggle_(p);
    case 'saveTache': return saveTache_(JSON.parse(p.tache));
    case 'deleteTache': return deleteTache_(p.id);
    case 'setConfig': return setConfig_(p.cle, p.valeur);
    case 'vapidPublic': return vapidKeys_().pub;
    case 'subscribePush': return subscribePush_(p);
    case 'unsubscribePush': return unsubscribePush_(p.endpoint);
    case 'digest': return digest_(p.moment, p.qui);
    case 'testPush': return envoyerPush_(p.moment || 'matin');
    case 'snooze': return snooze_(p.id, p.jusqua);
    default: throw new Error('Action inconnue : ' + action);
  }
}

function paquet_() {
  var journal = lire_('Journal').map(function (r) {
    return { id: r.id, date: r.date instanceof Date ? ymd_(r.date) : String(r.date), qui: r.qui, retard: Number(r.retard) || 0 };
  });
  return {
    taches: lire_('Taches'),
    journal: journal,
    config: config(),
    snooze: snoozeMap_(),
    aujourdhui: ymd_(new Date())
  };
}

function verrou_() { return parseInt(config().verrou_jours || '2', 10); }

function jourVerrouille_(dateStr) {
  var v = verrou_();
  if (!v || v > 900) return false;
  var diff = Math.round((parseYmd_(ymd_(new Date())) - parseYmd_(dateStr)) / 86400000);
  return diff >= v;
}

function estActif_(t) {
  if (t.actif === false) return false;
  var s = String(t.actif).toLowerCase();
  return s !== 'false' && s !== 'faux' && s !== 'non';
}

function toggle_(p) {
  if (jourVerrouille_(p.date)) throw new Error('Jour verrouillé');
  var sh = ss_().getSheetByName('Journal');
  var v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    var d = v[i][2] instanceof Date ? ymd_(v[i][2]) : String(v[i][2]);
    if (String(v[i][1]) === p.id && d === p.date) {
      sh.deleteRow(i + 1);
      return { retire: true };
    }
  }
  var retard = Math.round((new Date() - parseYmd_(p.date)) / 86400000);
  sh.appendRow([new Date(), p.id, p.date, p.qui || '', retard]);
  return { ajoute: true };
}

/* ------------------------------------------------ snooze (partagé) */

function snoozeSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName('Snooze');
  if (!sh) {
    sh = ss.insertSheet('Snooze');
    sh.getRange(1, 1, 1, 2).setValues([['id', 'jusqua']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function snoozeMap_() {
  var today = ymd_(new Date());
  var o = {};
  var sh = ss_().getSheetByName('Snooze');
  if (!sh) return o;
  lire_('Snooze').forEach(function (r) {
    var j = r.jusqua instanceof Date ? ymd_(r.jusqua) : String(r.jusqua);
    if (r.id && j > today) o[r.id] = j;   // masquée jusqu'à (non compris) j
  });
  return o;
}

function snooze_(id, jusqua) {
  var sh = snoozeSheet_();
  sh.getRange('B:B').setNumberFormat('@');
  var v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][0]) === String(id)) sh.deleteRow(i + 1);
  }
  if (jusqua) sh.appendRow([id, String(jusqua)]);
  return { ok: true };
}

function saveTache_(t) {
  var sh = ss_().getSheetByName('Taches');
  sh.getRange('G:G').setNumberFormat('@'); // "regle" en texte : garde "2026-09-15" tel quel
  var v = sh.getDataRange().getValues();
  var ligne = [t.id, t.nom, t.zone, t.qui, Number(t.duree) || 0, t.mode, String(t.regle), t.actif !== false];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(t.id)) {
      sh.getRange(i + 1, 1, 1, 8).setValues([ligne]);
      return { modifie: true };
    }
  }
  sh.appendRow(ligne);
  return { cree: true };
}

function deleteTache_(id) {
  var sh = ss_().getSheetByName('Taches');
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(id)) { sh.deleteRow(i + 1); return { supprime: true }; }
  }
  return { supprime: false };
}

function setConfig_(cle, valeur) {
  var sh = ss_().getSheetByName('Config');
  var v = sh.getDataRange().getValues();
  var trouve = false;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === cle) { sh.getRange(i + 1, 2).setValue(valeur); trouve = true; break; }
  }
  if (!trouve) sh.appendRow([cle, valeur]);
  if (cle === 'heure_matin' || cle === 'heure_soir') installerDeclencheurs();
  return { ok: true };
}

/* --------------------------------------------------- moteur de récurrence */

function derniereFois_(journal, id) {
  var d = null;
  journal.forEach(function (r) {
    if (r.id === id && (!d || r.date > d)) d = r.date;
  });
  return d;
}

function estDue_(t, dateStr, journal) {
  var d = parseYmd_(dateStr);
  if (t.mode === 'quotidien') return true;
  if (t.mode === 'jours') {
    return String(t.regle).split(',').map(function (s) { return s.trim(); })
      .indexOf(JOURS[d.getDay()]) >= 0;
  }
  if (t.mode === 'mois') {
    var jour = parseInt(t.regle, 10);
    var dernierDuMois = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(jour, dernierDuMois);
  }
  if (t.mode === 'intervalle') {
    var n = parseInt(t.regle, 10) || 1;
    var last = derniereFois_(journal, t.id);
    if (!last) return true;
    var ecoule = Math.round((d - parseYmd_(last)) / 86400000);
    return ecoule >= n;
  }
  if (t.mode === 'date') {
    return dateStr === String(t.regle);
  }
  return false;
}

function retardJours_(t, dateStr, journal) {
  if (t.mode === 'date') {
    if (derniereFois_(journal, t.id)) return 0;
    return Math.max(0, Math.round((parseYmd_(dateStr) - parseYmd_(String(t.regle))) / 86400000));
  }
  if (t.mode !== 'intervalle') return 0;
  var n = parseInt(t.regle, 10) || 1;
  var last = derniereFois_(journal, t.id);
  if (!last) return 0;
  var ecoule = Math.round((parseYmd_(dateStr) - parseYmd_(last)) / 86400000);
  return Math.max(0, ecoule - n);
}

function faite_(journal, id, dateStr) {
  return journal.some(function (r) { return r.id === id && r.date === dateStr; });
}

function tachesDuJour_(dateStr) {
  var p = paquet_();
  var actives = p.taches.filter(estActif_);
  var due = actives.filter(function (t) { return estDue_(t, dateStr, p.journal); });
  if (dateStr === ymd_(new Date())) {
    actives.forEach(function (t) {
      if (t.mode === 'date' && String(t.regle) < dateStr &&
          !derniereFois_(p.journal, t.id) && due.indexOf(t) < 0) {
        due.push(t);
      }
    });
  }
  return due.map(function (t) {
    return {
      nom: t.nom, zone: t.zone, qui: t.qui, duree: Number(t.duree) || 0,
      retard: retardJours_(t, dateStr, p.journal),
      faite: faite_(p.journal, t.id, dateStr)
    };
  });
}

/* ------------------------------------------------------------------ mails */

function enVacances_() { return String(config().vacances).toLowerCase() === 'oui'; }

function actif_(cle) { return String(config()[cle]).toLowerCase() === 'oui'; }

function envoyer_(sujet, html) {
  var dest = config().destinataires;
  if (!dest) return;
  MailApp.sendEmail({ to: dest, subject: sujet, htmlBody: html });
}

function css_() {
  return 'font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#14181b;line-height:1.6';
}

/* déclenché le matin : notification push + (option) e-mail */
function digestMatin() {
  if (enVacances_()) return;
  envoyerPush_('matin');
  if (actif_('mail_quotidien')) mailMatin_();
}

/* déclenché le soir : notification push + (option) e-mail */
function digestSoir() {
  if (enVacances_()) return;
  envoyerPush_('soir');
  if (actif_('mail_soir')) mailSoir_();
}

function mailMatin_() {
  var today = ymd_(new Date());
  var l = tachesDuJour_(today).filter(function (t) { return !t.faite; });
  if (!l.length) return;
  var min = l.reduce(function (s, t) { return s + t.duree; }, 0);
  var html = '<div style="' + css_() + '"><h2 style="font-weight:500">Ménage du jour</h2>' +
    '<p style="color:#6b7573">' + l.length + ' tâches · ' + min + ' min</p><ul>';
  l.forEach(function (t) {
    html += '<li>' + t.nom + ' <span style="color:#6b7573">— ' + t.zone + ' · ' + t.duree + ' min' +
      (t.qui ? ' · ' + t.qui : '') + '</span>' +
      (t.retard > 0 ? ' <b style="color:#b8730f">+' + t.retard + ' j</b>' : '') + '</li>';
  });
  envoyer_('Ménage — ' + l.length + ' tâches aujourd\'hui', html + '</ul></div>');
}

function mailSoir_() {
  var today = ymd_(new Date());
  var l = tachesDuJour_(today);
  if (!l.length) return;
  var faites = l.filter(function (t) { return t.faite; });
  var reste = l.filter(function (t) { return !t.faite; });
  var html = '<div style="' + css_() + '"><h2 style="font-weight:500">Ménage — ce soir</h2>' +
    '<p style="color:#6b7573">' + faites.length + ' faites · ' + reste.length + ' à faire</p>';
  if (reste.length) {
    html += '<ul>' + reste.map(function (t) {
      return '<li>' + t.nom + (t.retard > 0 ? ' <b style="color:#b8730f">+' + t.retard + ' j</b>' : '') + '</li>';
    }).join('') + '</ul>';
  } else {
    html += '<p>Tout est fait pour aujourd\'hui.</p>';
  }
  envoyer_('Ménage — ' + reste.length + ' tâche(s) restante(s)', html + '</div>');
}

function mailHebdo() { if (actif_('mail_hebdo') && !enVacances_()) recap_(7, 'Récap de la semaine'); }
function mailMensuel() { if (actif_('mail_mensuel') && !enVacances_()) recap_(30, 'Récap du mois'); }

function recap_(jours, titre) {
  var p = paquet_();
  var taches = p.taches.filter(estActif_);
  var fin = new Date(), debut = new Date();
  debut.setDate(fin.getDate() - jours);
  var faits = p.journal.filter(function (r) {
    var d = parseYmd_(r.date);
    return d >= debut && d <= fin;
  });

  var parPersonne = {}, minutes = {}, aLheure = 0;
  var duree = {};
  p.taches.forEach(function (t) { duree[t.id] = Number(t.duree) || 0; });
  var gens_ = String(config().personnes || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  faits.forEach(function (r) {
    if (r.retard <= 0) aLheure++;
    var m = duree[r.id] || 0;
    if (r.qui === 'À deux' && gens_.length) {
      gens_.forEach(function (g) {
        parPersonne[g] = (parPersonne[g] || 0) + 1 / gens_.length;
        minutes[g] = (minutes[g] || 0) + m / gens_.length;
      });
      return;
    }
    var q = r.qui || 'non attribué';
    parPersonne[q] = (parPersonne[q] || 0) + 1;
    minutes[q] = (minutes[q] || 0) + m;
  });

  var attendu = 0;
  taches.forEach(function (t) {
    if (t.mode === 'quotidien') attendu += jours;
    else if (t.mode === 'jours') attendu += String(t.regle).split(',').length * (jours / 7);
    else if (t.mode === 'mois') attendu += jours / 30;
    else if (t.mode === 'intervalle') attendu += jours / (parseInt(t.regle, 10) || 1);
    else if (t.mode === 'date') {
      var jd = parseYmd_(String(t.regle));
      if (jd >= debut && jd <= fin) attendu += 1;
    }
  });
  attendu = Math.max(1, Math.round(attendu));

  var ponctualite = faits.length ? Math.round(aLheure / faits.length * 100) : 0;
  var accomplissement = Math.min(100, Math.round(faits.length / attendu * 100));

  var html = '<div style="' + css_() + '"><h2 style="font-weight:500">' + titre + '</h2>' +
    '<p><b>' + faits.length + '</b> tâches faites sur environ ' + attendu + ' prévues · ' +
    '<b>' + accomplissement + '%</b> d\'accomplissement · <b>' + ponctualite + '%</b> dans les temps</p>' +
    '<h3 style="font-weight:500">Répartition</h3><ul>';
  Object.keys(parPersonne).forEach(function (q) {
    html += '<li>' + q + ' — ' + Math.round(parPersonne[q]) + ' tâches, ' + Math.round(minutes[q]) + ' min</li>';
  });
  html += '</ul><h3 style="font-weight:500">Jamais faites sur la période</h3><ul>';
  var vues = {};
  faits.forEach(function (r) { vues[r.id] = 1; });
  var oubliees = taches.filter(function (t) { return !vues[t.id]; });
  html += oubliees.length
    ? oubliees.map(function (t) { return '<li>' + t.nom + '</li>'; }).join('')
    : '<li style="color:#6b7573">Aucune, tout est passé au moins une fois</li>';
  envoyer_(titre, html + '</ul></div>');
}

/* ==================================================================== */
/* WEB PUSH — VAPID + ECDSA P-256 en BigInt pur (Apps Script n'a pas     */
/* de signature ECDSA native). On envoie un push VIDE ; le service       */
/* worker va chercher lui-même le contenu via action=digest.            */
/* ==================================================================== */

var _P  = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
var _A  = _P - BigInt(3);
var _N  = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
var _GX = BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
var _GY = BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');
var _0 = BigInt(0), _1 = BigInt(1), _2 = BigInt(2), _3 = BigInt(3), _8 = BigInt(8), _FF = BigInt(255);

function _mod(a, m) { return ((a % m) + m) % m; }

function _modInv(a, m) {
  a = _mod(a, m);
  var r0 = a, r = m, s0 = _1, s = _0, t;
  while (r !== _0) {
    var q = r0 / r;
    t = r; r = r0 - q * r; r0 = t;
    t = s; s = s0 - q * s; s0 = t;
  }
  return _mod(s0, m);
}

function _ptAdd(p, q) {
  if (!p) return q;
  if (!q) return p;
  var x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1], m;
  if (x1 === x2 && _mod(y1 + y2, _P) === _0) return null;
  if (x1 === x2 && y1 === y2) m = _mod((_3 * x1 * x1 + _A) * _modInv(_2 * y1, _P), _P);
  else m = _mod((y2 - y1) * _modInv(x2 - x1, _P), _P);
  var x3 = _mod(m * m - x1 - x2, _P);
  return [x3, _mod(m * (x1 - x3) - y1, _P)];
}

function _ptMul(k, p) {
  var r = null, a = p;
  while (k > _0) { if (k & _1) r = _ptAdd(r, a); a = _ptAdd(a, a); k >>= _1; }
  return r;
}

/* octets non signés <-> Java bytes signés <-> BigInt */
function _s(b) { var o = []; for (var i = 0; i < b.length; i++) o.push(b[i] > 127 ? b[i] - 256 : b[i]); return o; }
function _u(b) { var o = []; for (var i = 0; i < b.length; i++) o.push(b[i] < 0 ? b[i] + 256 : b[i]); return o; }
function _cat() { var o = []; for (var i = 0; i < arguments.length; i++) { var a = arguments[i]; for (var j = 0; j < a.length; j++) o.push(a[j]); } return o; }
function _fill(n, v) { var o = []; for (var i = 0; i < n; i++) o.push(v); return o; }
function _b2big(b) { var x = _0; for (var i = 0; i < b.length; i++) x = (x << _8) | BigInt(b[i] & 255); return x; }
function _big2b(x, len) { var o = _fill(len, 0); for (var i = len - 1; i >= 0; i--) { o[i] = Number(x & _FF); x >>= _8; } return o; }
function _strBytes(str) { return _u(Utilities.newBlob(str).getBytes()); }

function _sha256(bytes) { return _u(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, _s(bytes))); }
function _hmac(key, data) { return _u(Utilities.computeHmacSha256Signature(_s(data), _s(key))); }

function _b64url(bytes) { return Utilities.base64EncodeWebSafe(_s(bytes)).replace(/=+$/, ''); }
function _b64urlDec(str) {
  var s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return _u(Utilities.base64Decode(s));
}

/* RFC 6979 : nonce déterministe (pas besoin d'aléa sûr) */
function _rfc6979(h1, priv) {
  var x = _big2b(priv, 32);
  var V = _fill(32, 1), K = _fill(32, 0);
  K = _hmac(K, _cat(V, [0], x, h1)); V = _hmac(K, V);
  K = _hmac(K, _cat(V, [1], x, h1)); V = _hmac(K, V);
  var premier = true;
  return {
    suivant: function () {
      while (true) {
        if (!premier) { K = _hmac(K, _cat(V, [0])); V = _hmac(K, V); }
        premier = false;
        var T = [];
        while (T.length < 32) { V = _hmac(K, V); T = _cat(T, V); }
        var k = _b2big(T.slice(0, 32));
        if (k >= _1 && k < _N) return k;
      }
    }
  };
}

/* signature ECDSA P-256, sortie r||s (64 octets, format JWS ES256) */
function _signP256(msgBytes, privBytes) {
  var priv = _b2big(privBytes);
  var h = _sha256(msgBytes);
  var z = _b2big(h);
  var gen = _rfc6979(h, priv);
  for (var i = 0; i < 20; i++) {
    var k = gen.suivant();
    var R = _ptMul(k, [_GX, _GY]);
    var r = _mod(R[0], _N);
    if (r === _0) continue;
    var s = _mod(_modInv(k, _N) * (z + r * priv), _N);
    if (s === _0) continue;
    return _cat(_big2b(r, 32), _big2b(s, 32));
  }
  throw new Error('signature P-256 impossible');
}

/* vecteur RFC 6979 A.2.5 — à lancer une fois pour valider la crypto dans Apps Script */
function testCryptoPush() {
  var x = _b64urlDec('ya-p2EW6dRZrXCFXZ7HWk05Qw9s26JsSe4piKxIPZyE'); // clé privée du vecteur
  var sig = _signP256(_strBytes('sample'), x);
  var r = _b64url(sig.slice(0, 32)), s = _b64url(sig.slice(32));
  var ok = (r === '79SLKqy2qP0RQN2c1F6B1p0sh3tWqvmRw00OqE6vNxY' &&
            s === '98sclC1lfEHUNsehtuKfZfPpANu5r_QGTcSrL4Q6zag');
  Logger.log('testCryptoPush : ' + (ok ? 'OK — signature ECDSA correcte' : 'ÉCHEC\n r=' + r + '\n s=' + s));
  return ok;
}

/* ----------------------------------------------------- clés VAPID */

function genererVapid_() {
  var seed = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + String(new Date().getTime());
  var d = _b2big(_sha256(_strBytes(seed)));
  d = _mod(d, _N - _1) + _1;
  var Q = _ptMul(d, [_GX, _GY]);
  var pub = _cat([4], _big2b(Q[0], 32), _big2b(Q[1], 32));
  return { priv: _b64url(_big2b(d, 32)), pub: _b64url(pub) };
}

function vapidKeys_() {
  var pub = PROP.getProperty('VAPID_PUB');
  var priv = PROP.getProperty('VAPID_PRIV');
  if (!pub || !priv) {
    var kp = genererVapid_();
    PROP.setProperty('VAPID_PUB', kp.pub);
    PROP.setProperty('VAPID_PRIV', kp.priv);
    return kp;
  }
  return { pub: pub, priv: priv };
}

function vapidJwt_(audience) {
  var v = vapidKeys_();
  var subj = 'mailto:' + String(config().destinataires || 'menage@example.com').split(',')[0].trim();
  var header = _b64url(_strBytes(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  var body = _b64url(_strBytes(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subj
  })));
  var input = header + '.' + body;
  var sig = _signP256(_strBytes(input), _b64urlDec(v.priv));
  return { jwt: input + '.' + _b64url(sig), k: v.pub };
}

/* ------------------------------------------------ feuille Push */

function pushSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName('Push');
  if (!sh) {
    sh = ss.insertSheet('Push');
    sh.getRange(1, 1, 1, 7)
      .setValues([['endpoint', 'p256dh', 'auth', 'qui', 'matin', 'soir', 'ajoute']])
      .setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  // migration douce : ajouter matin/soir aux anciennes feuilles (5 colonnes)
  var head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  if (head.indexOf('matin') < 0) {
    var col = (head.indexOf('ajoute') >= 0 ? head.indexOf('ajoute') : head.length) + 1;
    sh.insertColumnsBefore(col, 2);
    sh.getRange(1, col, 1, 2).setValues([['matin', 'soir']]).setFontWeight('bold');
  }
  return sh;
}

function pushSubs_() {
  return lire_('Push').filter(function (r) { return r.endpoint; });
}

function _veut_(pref) { return String(pref).toLowerCase() !== 'non'; } // absent / 'oui' = oui

function subscribePush_(p) {
  var sh = pushSheet_();
  var v = sh.getDataRange().getValues();
  var matin = (p.matin === 'non' || p.matin === false) ? 'non' : 'oui';
  var soir = (p.soir === 'non' || p.soir === false) ? 'non' : 'oui';
  var ligne = [p.endpoint, p.p256dh || '', p.auth || '', p.qui || '', matin, soir, new Date()];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === p.endpoint) {
      sh.getRange(i + 1, 1, 1, 7).setValues([ligne]);
      return { maj: true };
    }
  }
  sh.appendRow(ligne);
  return { ajoute: true };
}

function unsubscribePush_(endpoint) {
  var sh = pushSheet_();
  var v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][0]) === endpoint) { sh.deleteRow(i + 1); return { supprime: true }; }
  }
  return { supprime: false };
}

/* ------------------------------------------------ envoi des push */

function envoyerPush_(moment) {
  var subs = pushSubs_().filter(function (s) {
    return _veut_(moment === 'soir' ? s.soir : s.matin);
  });
  if (!subs.length) return { envoyes: 0, abonnes: 0 };
  var envoyes = 0, morts = [], jwts = {};
  subs.forEach(function (s) {
    try {
      var parts = String(s.endpoint).split('/');
      var aud = parts[0] + '//' + parts[2];
      if (!jwts[aud]) jwts[aud] = vapidJwt_(aud);
      var v = jwts[aud];
      var res = UrlFetchApp.fetch(s.endpoint, {
        method: 'post',
        headers: { 'TTL': '3600', 'Authorization': 'vapid t=' + v.jwt + ', k=' + v.k },
        payload: '',
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      if (code === 200 || code === 201) envoyes++;
      else if (code === 404 || code === 410) morts.push(s.endpoint);
      else Logger.log('push ' + code + ' : ' + res.getContentText().slice(0, 200));
    } catch (e) {
      Logger.log('push erreur : ' + e);
    }
  });
  morts.forEach(unsubscribePush_);
  return { envoyes: envoyes, abonnes: subs.length, retires: morts.length };
}

/* --------------------------------- contenu du digest (matin / soir) */

function digest_(moment, qui) {
  if (!moment) {
    var h = parseInt(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'H'), 10);
    moment = h < 14 ? 'matin' : 'soir';
  }
  var today = ymd_(new Date());
  var l = tachesDuJour_(today).filter(function (t) {
    return !t.qui || !qui || t.qui === qui;   // les tâches de la personne + les libres
  });

  if (moment === 'matin') {
    var reste = l.filter(function (t) { return !t.faite; });
    if (!reste.length) return { titre: 'Ménage — rien de prévu', corps: 'Journée tranquille aujourd\'hui.' };
    var min = reste.reduce(function (s, t) { return s + t.duree; }, 0);
    return {
      titre: reste.length + (reste.length > 1 ? ' tâches' : ' tâche') + ' aujourd\'hui · ' + min + ' min',
      corps: reste.map(function (t) { return '• ' + t.nom + (t.retard > 0 ? ' (+' + t.retard + 'j)' : ''); }).join('\n')
    };
  }

  if (!l.length) return { titre: 'Ménage', corps: 'Rien n\'était prévu aujourd\'hui.' };
  var faites = l.filter(function (t) { return t.faite; }).length;
  var restant = l.filter(function (t) { return !t.faite; });
  return {
    titre: faites + (faites > 1 ? ' faites' : ' faite') + ', ' + restant.length + ' à faire',
    corps: restant.length
      ? 'Reste : ' + restant.map(function (t) { return t.nom; }).join(', ')
      : 'Tout est fait pour aujourd\'hui.'
  };
}
