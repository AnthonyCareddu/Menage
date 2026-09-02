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
  c.getRange(2, 1, 7, 2).setValues([
    ['personnes', 'Antho,Alexandra'],
    ['destinataires', Session.getActiveUser().getEmail()],
    ['mail_quotidien', 'oui'],
    ['mail_hebdo', 'oui'],
    ['mail_mensuel', 'oui'],
    ['vacances', 'non'],
    ['heure_envoi', '7']
  ]);

  installerDeclencheurs();
  Logger.log('Base créée : ' + ss.getUrl());
  return ss.getUrl();
}

function installerDeclencheurs() {
  ScriptApp.getProjectTriggers().forEach(function (tr) { ScriptApp.deleteTrigger(tr); });
  var h = parseInt(config().heure_envoi || '7', 10);
  ScriptApp.newTrigger('mailQuotidien').timeBased().everyDays(1).atHour(h).create();
  ScriptApp.newTrigger('mailHebdo').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(h).create();
  ScriptApp.newTrigger('mailMensuel').timeBased().onMonthDay(1).atHour(h).create();
}

/**
 * À lancer UNE FOIS après avoir collé une nouvelle version de Code.gs.
 * Idempotent : sans danger si relancé. Ne recrée jamais la base (contrairement à setup()).
 */
function migrer() {
  var ss = ss_();
  // la colonne "regle" doit rester du texte, sinon Sheets convertit "2026-09-15" en date
  ss.getSheetByName('Taches').getRange('G:G').setNumberFormat('@');
  installerDeclencheurs();
  Logger.log('Migration OK');
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

function doGet(e) {
  var p = e.parameter || {};
  var out;
  try {
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
    aujourdhui: ymd_(new Date())
  };
}

function estActif_(t) {
  if (t.actif === false) return false;
  var s = String(t.actif).toLowerCase();
  return s !== 'false' && s !== 'faux' && s !== 'non';
}

function toggle_(p) {
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
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === cle) { sh.getRange(i + 1, 2).setValue(valeur); return { ok: true }; }
  }
  sh.appendRow([cle, valeur]);
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

function mailQuotidien() {
  if (!actif_('mail_quotidien') || enVacances_()) return;
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
  faits.forEach(function (r) {
    var q = r.qui || 'non attribué';
    parPersonne[q] = (parPersonne[q] || 0) + 1;
    minutes[q] = (minutes[q] || 0) + (duree[r.id] || 0);
    if (r.retard <= 0) aLheure++;
  });

  var attendu = 0;
  taches.forEach(function (t) {
    if (t.mode === 'jours') attendu += String(t.regle).split(',').length * (jours / 7);
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
    html += '<li>' + q + ' — ' + parPersonne[q] + ' tâches, ' + minutes[q] + ' min</li>';
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
