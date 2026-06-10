#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate the Promote card user guide as BOTH .docx (Word) and .pptx (PowerPoint),
using only the Python standard library (each file is a ZIP of OOXML parts).

Every "step" carries a description + a screenshot PLACEHOLDER box the user fills in.
"""
import os, zipfile
from xml.sax.saxutils import escape

OUT = os.path.dirname(os.path.abspath(__file__))
TITLE = "Carte Promote — Guide utilisateur"
SUB = "Afriland First Bank · Souscription & gestion de la carte prépayée"
SITE = "https://rfprepaidcard.afrilandfirstbank.com"

def esc(s): return escape(str(s), {'"': "&quot;", "'": "&apos;"})

# ---------------------------------------------------------------- CONTENT
# kind: cover | section | step. step => bullets + capture placeholder caption.
CONTENT = [
    {"kind": "cover", "title": TITLE, "sub": SUB,
     "bullets": [f"Application web : {SITE}", "Document de prise en main pour tous les profils",
                 "Les cadres « 📷 Capture » sont à remplir avec vos propres copies d'écran."]},

    {"kind": "section", "title": "1. Accès & rôles"},
    {"kind": "step", "title": "Se connecter", "capture": "Écran de connexion",
     "bullets": [f"Ouvrir {SITE} dans un navigateur (Chrome / Edge / Safari).",
                 "Saisir son e-mail et son mot de passe, puis « Se connecter ».",
                 "Le système ouvre l'espace correspondant au rôle du compte."]},
    {"kind": "step", "title": "Les trois rôles", "capture": "Comparatif des 3 espaces",
     "bullets": ["Administrateur — tableau de bord, configuration, utilisateurs, historique des paiements.",
                 "Conseiller (commercial) — souscription assistée, ses ventes, réclamation de ventes QR.",
                 "Point d'impression (imprimeur) — recherche d'un dossier, validation, activation/impression de la carte."]},

    {"kind": "section", "title": "2. Parcours CLIENT — souscription en ligne (QR)"},
    {"kind": "step", "title": "Écran d'accueil", "capture": "Accueil client (après scan du QR)",
     "bullets": ["Le client scanne le QR code présenté par le conseiller (ou ouvre le lien).",
                 "Titre : « Offre Promotionnelle pour votre carte prépayée AFB ».",
                 "Les 3 étapes sont rappelées, puis bouton « Commencer »."]},
    {"kind": "step", "title": "Étape 1 — Identité", "capture": "Formulaire d'identité",
     "bullets": ["Renseigner : prénom, nom, sexe, n° CNI, NIU (facultatif), date d'expiration de la CNI.",
                 "Date d'expiration : choisie via le calendrier (date picker).",
                 "Téléphone : sélecteur de pays (drapeau + indicatif, défaut Cameroun) puis le numéro.",
                 "E-mail, quartier, ville. Puis « Continuer »."]},
    {"kind": "step", "title": "Étape 2 — Pièce d'identité (CNI)", "capture": "Capture CNI recto / verso",
     "bullets": ["Photographier le RECTO puis le VERSO de la CNI avec la caméra arrière.",
                 "Suivre les conseils de cadrage (carte à plat, bien éclairée, sans reflet).",
                 "Les deux faces doivent être capturées pour continuer."]},
    {"kind": "step", "title": "Étape 3 — Selfie", "capture": "Prise du selfie",
     "bullets": ["Prendre une photo en direct (caméra avant) pour la vérification d'identité (KYC).",
                 "Cadrer le visage dans l'ovale, dans un endroit éclairé.",
                 "Possibilité de reprendre la photo."]},
    {"kind": "step", "title": "Étape 4 — Mode de paiement", "capture": "Choix du moyen de paiement",
     "bullets": ["Choisir : Orange Money, MTN MoMo, SARA Money ou Espèces.",
                 "Pour Mobile Money : saisir le NUMÉRO qui recevra la demande de paiement (peut différer du contact).",
                 "Sélecteur de pays disponible sur ce numéro également."]},
    {"kind": "step", "title": "Récapitulatif & lancement du paiement", "capture": "Récapitulatif avant paiement",
     "bullets": ["Vérifier les informations + le montant (Prix de la carte = Total à payer).",
                 "Lancer le paiement : une demande est poussée vers le téléphone du client.",
                 "Le client compose son code secret Orange Money / MTN MoMo."]},
    {"kind": "step", "title": "Résultat — Paiement réussi", "capture": "Écran « Paiement réussi »",
     "bullets": ["Cercle VERT avec une coche, titre « Paiement réussi ».",
                 "Affichage de la référence (PRM-…), du QR et du reçu téléchargeable.",
                 "Statut « Payée »."]},
    {"kind": "step", "title": "Résultat — Échec / Solde insuffisant", "capture": "Écran d'échec / solde insuffisant",
     "bullets": ["Cercle ROUGE avec une alerte, titre « Paiement non abouti » (ou « Solde insuffisant »).",
                 "Le motif exact renvoyé par l'opérateur est affiché.",
                 "Boutons « Réessayer » / « Accueil ». L'annulation côté USSD est détectée automatiquement."]},

    {"kind": "section", "title": "3. Parcours CONSEILLER (commercial)"},
    {"kind": "step", "title": "Espace conseiller", "capture": "Tableau de bord conseiller",
     "bullets": ["Après connexion : ses statistiques et la liste de ses ventes.",
                 "Chaque ligne affiche la PHOTO du client + nom, téléphone, CNI, date, montant et statut.",
                 "Recherche avancée (référence, nom, NIU, téléphone)."]},
    {"kind": "step", "title": "Nouvelle souscription assistée", "capture": "Souscription assistée (formulaire)",
     "bullets": ["Le conseiller saisit le dossier KYC du client (même formulaire que le parcours client).",
                 "Il lance ensuite le paiement (MoMo / espèces / SARA).",
                 "La vente est rattachée au conseiller."]},
    {"kind": "step", "title": "Réclamer une vente QR", "capture": "Réclamation d'une vente (claim)",
     "bullets": ["Pour s'attribuer une souscription faite en libre-service via QR.",
                 "Saisir le téléphone + le n° CNI du client.",
                 "Si la vente est payée et non attribuée, elle est ajoutée aux statistiques du conseiller."]},

    {"kind": "section", "title": "4. Parcours POINT D'IMPRESSION (imprimeur)"},
    {"kind": "step", "title": "Rechercher un dossier", "capture": "Recherche imprimeur + résultats",
     "bullets": ["Saisir une référence (PRM-…), un nom ou un numéro de téléphone.",
                 "Chaque résultat affiche la PHOTO du client + nom, référence, téléphone, CNI et statut.",
                 "But : identifier visuellement le client rapidement."]},
    {"kind": "step", "title": "Consulter la fiche", "capture": "Fiche complète du dossier",
     "bullets": ["Photo client + CNI recto/verso (cliquer une image pour l'agrandir en plein écran).",
                 "Toutes les informations + le badge de statut (Payée / Échouée / …).",
                 "Possibilité de reprendre une photo mal cadrée."]},
    {"kind": "step", "title": "Valider un reçu SARA", "capture": "Validation d'un reçu SARA",
     "bullets": ["Pour un paiement SARA en attente : vérifier la référence, le payeur et le montant extraits du reçu.",
                 "Corriger si nécessaire, puis « Valider » (ou « Refuser »).",
                 "La validation fait passer le paiement à « Payée »."]},
    {"kind": "step", "title": "Activer & imprimer la carte", "capture": "Activation (n° de carte)",
     "bullets": ["Uniquement si le paiement est réglé (Payée ou espèces).",
                 "Saisir le n° de la carte physique (PAN facultatif), puis « Imprimer & remettre ».",
                 "Si le paiement a ÉCHOUÉ ou est en attente : l'activation est BLOQUÉE (message « Paiement non réglé »)."]},

    {"kind": "section", "title": "5. Parcours ADMINISTRATEUR"},
    {"kind": "step", "title": "Vue d'ensemble", "capture": "Tableau de bord — KPI",
     "bullets": ["KPI : Souscriptions, Montant collecté, Réussies, En attente, ÉCHOUÉES.",
                 "Le KPI « Échouées » (rouge) est cliquable → ouvre la liste filtrée sur les échecs.",
                 "Répartition des ventes par conseiller."]},
    {"kind": "step", "title": "Configuration de la carte", "capture": "Configuration carte",
     "bullets": ["Définir le prix de la carte (et frais / transport).",
                 "Ces montants s'appliquent à toutes les nouvelles souscriptions.",
                 "« Enregistrer »."]},
    {"kind": "step", "title": "Utilisateurs — créer un compte", "capture": "Création d'un utilisateur",
     "bullets": ["Renseigner nom, e-mail, rôle, mot de passe.",
                 "Pour un conseiller : agence + téléphone (9 chiffres) obligatoires.",
                 "La liste des comptes existants est affichée en dessous."]},
    {"kind": "step", "title": "Utilisateurs — import en masse", "capture": "Import d'utilisateurs (aperçu)",
     "bullets": ["Charger un fichier CSV (modèle téléchargeable) OU coller un tableau Excel.",
                 "Aperçu : chaque ligne étiquetée Nouveau / Doublon / Invalide.",
                 "Choisir « Ignorer les doublons » ou « Mettre à jour », puis « Importer ».",
                 "Mots de passe temporaires générés + export CSV des identifiants à communiquer."]},
    {"kind": "step", "title": "Historique des paiements", "capture": "Tableau des transactions",
     "bullets": ["Tableau détaillé : Photo · Client · Téléphone · CNI · Date · Paiement · Montant · Statut.",
                 "Filtres (recherche, statut, conseiller, dates) + chip rapide « Échouées ».",
                 "Pagination ; clic sur une ligne = détail complet ; export CSV."]},

    {"kind": "section", "title": "6. Repères — paiement & statuts"},
    {"kind": "step", "title": "Distinguer réussi / échoué", "capture": "Comparatif réussi vs échoué",
     "bullets": ["Client : écran VERT « Paiement réussi » vs écran ROUGE « Paiement non abouti / Solde insuffisant ».",
                 "Utilisateurs : badge « Payée » (vert) vs « Échouée » (rouge) sur chaque dossier.",
                 "Un échec n'est jamais masqué par une impression (statut « Échouée » prioritaire)."]},
    {"kind": "step", "title": "Légende des statuts", "capture": "Légende des badges (facultatif)",
     "bullets": ["Payée (vert) · Échouée (rouge) · KYC en attente (ambre).",
                 "À payer espèces · SARA — à valider · Imprimée.",
                 "Les badges apparaissent dans toutes les listes et le tableau admin."]},
]

# ================================================================ DOCX
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

def w_p(text, style=None, bullet=False, color=None, bold=False, sz=None):
    ppr = "<w:pPr>"
    if style: ppr += f'<w:pStyle w:val="{style}"/>'
    if bullet: ppr += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    ppr += "</w:pPr>"
    rpr = ""
    if color or bold or sz:
        rpr = "<w:rPr>"
        if bold: rpr += "<w:b/>"
        if color: rpr += f'<w:color w:val="{color}"/>'
        if sz: rpr += f'<w:sz w:val="{sz}"/>'
        rpr += "</w:rPr>"
    return f'<w:p>{ppr}<w:r>{rpr}<w:t xml:space="preserve">{esc(text)}</w:t></w:r></w:p>'

def w_capture_box(caption):
    # A dashed, light-grey single-cell table acting as a screenshot placeholder.
    inner = (f'<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'
             f'<w:r><w:rPr><w:b/><w:color w:val="888888"/></w:rPr>'
             f'<w:t xml:space="preserve">📷 Capture : {esc(caption)}</w:t></w:r></w:p>')
    inner += ('<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="AAAAAA"/><w:sz w:val="18"/></w:rPr>'
              '<w:t>(insérer la copie d’écran ici)</w:t></w:r></w:p>')
    inner += "<w:p/>" * 4
    borders = ('<w:tblBorders>' + "".join(
        f'<w:{e} w:val="dashed" w:sz="6" w:space="0" w:color="BBBBBB"/>'
        for e in ("top", "left", "bottom", "right", "insideH", "insideV")) + "</w:tblBorders>")
    return (f'<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/>{borders}'
            f'<w:tblCellMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr>'
            f'<w:tblGrid><w:gridCol w:w="9300"/></w:tblGrid>'
            f'<w:tr><w:tc><w:tcPr><w:tcW w:w="9300" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F4F4F4"/>'
            f'<w:vAlign w:val="center"/></w:tcPr>{inner}</w:tc></w:tr></w:tbl><w:p/>')

def build_docx(path):
    body = []
    for it in CONTENT:
        k = it["kind"]
        if k == "cover":
            body.append(w_p(it["title"], style="Title"))
            body.append(w_p(it["sub"], style="Subtitle"))
            for b in it["bullets"]:
                body.append(w_p(b, bullet=True))
            body.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
        elif k == "section":
            body.append(w_p(it["title"], style="Heading1"))
        else:
            body.append(w_p(it["title"], style="Heading2"))
            for b in it["bullets"]:
                body.append(w_p(b, bullet=True))
            body.append(w_capture_box(it["capture"]))
    document = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document xmlns:w="{W}"><w:body>' + "".join(body) +
                '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
                '<w:pgMar w:top="1134" w:bottom="1134" w:left="1134" w:right="1134"/></w:sectPr>'
                '</w:body></w:document>')

    styles = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="{W}">
 <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
 <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:style>
 <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="D81E2C"/><w:sz w:val="56"/></w:rPr></w:style>
 <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:color w:val="766164"/><w:sz w:val="26"/></w:rPr></w:style>
 <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="280" w:after="140"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="D81E2C"/></w:pBdr></w:pPr><w:rPr><w:b/><w:color w:val="9B0F1E"/><w:sz w:val="34"/></w:rPr></w:style>
 <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="1E1416"/><w:sz w:val="28"/></w:rPr></w:style>
</w:styles>'''

    numbering = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="{W}">
 <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
 <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>'''

    ct = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
 <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
 <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>'''
    rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''
    drels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
 <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>'''
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", styles)
        z.writestr("word/numbering.xml", numbering)
        z.writestr("word/_rels/document.xml.rels", drels)

# ================================================================ PPTX
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
PML = "http://schemas.openxmlformats.org/presentationml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
EMU = 914400
SW, SH = 12192000, 6858000  # 16:9

def a_par(text, sz, color, bold=False, bullet=False, align="l"):
    bu = '<a:buChar char="•"/>' if bullet else '<a:buNone/>'
    mar = ' marL="228600" indent="-228600"' if bullet else ' marL="0" indent="0"'
    b = ' b="1"' if bold else ''
    return (f'<a:p><a:pPr{mar} algn="{align}">{bu}</a:pPr>'
            f'<a:r><a:rPr lang="fr-FR" sz="{sz}"{b}><a:solidFill><a:srgbClr val="{color}"/></a:solidFill></a:rPr>'
            f'<a:t>{esc(text)}</a:t></a:r></a:p>')

def sp_text(sid, name, x, y, cx, cy, paragraphs, fill=None, line=None, anchor="t"):
    sppr_fill = f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else '<a:noFill/>'
    sppr_line = line or ''
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
            f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>{sppr_fill}{sppr_line}</p:spPr>'
            f'<p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="68580" rIns="91440" bIns="68580" anchor="{anchor}"><a:normAutofit/></a:bodyPr>'
            f'<a:lstStyle/>{"".join(paragraphs)}</p:txBody></p:sp>')

def slide_xml(it):
    k = it["kind"]
    shapes = []
    sid = 2
    if k == "cover":
        shapes.append(sp_text(sid, "bg", 0, 0, SW, SH, [], fill="FFFFFF")); sid += 1
        shapes.append(sp_text(sid, "bar", 0, 0, SW, 36000, [], fill="D81E2C")); sid += 1
        shapes.append(sp_text(sid, "title", 800000, 2200000, SW-1600000, 1600000,
                              [a_par(it["title"], 4000, "D81E2C", bold=True)], anchor="ctr")); sid += 1
        shapes.append(sp_text(sid, "sub", 800000, 3700000, SW-1600000, 1400000,
                              [a_par(it["sub"], 1800, "766164")] +
                              [a_par("• " + b, 1300, "555555") for b in it["bullets"]], anchor="t")); sid += 1
    elif k == "section":
        shapes.append(sp_text(sid, "bg", 0, 0, SW, SH, [], fill="9B0F1E")); sid += 1
        shapes.append(sp_text(sid, "title", 800000, 2700000, SW-1600000, 1400000,
                              [a_par(it["title"], 3600, "FFFFFF", bold=True)], anchor="ctr")); sid += 1
    else:
        shapes.append(sp_text(sid, "bg", 0, 0, SW, SH, [], fill="FFFFFF")); sid += 1
        shapes.append(sp_text(sid, "title", 500000, 380000, SW-1000000, 760000,
                              [a_par(it["title"], 2600, "9B0F1E", bold=True)])); sid += 1
        bullets = [a_par(b, 1500, "1E1416", bullet=True) for b in it["bullets"]]
        shapes.append(sp_text(sid, "body", 500000, 1300000, 5500000, SH-1700000, bullets, anchor="t")); sid += 1
        # screenshot placeholder on the right
        ph_line = '<a:ln w="19050"><a:solidFill><a:srgbClr val="BBBBBB"/></a:solidFill><a:prstDash val="dash"/></a:ln>'
        cap = [a_par("📷 Capture", 1600, "888888", bold=True, align="ctr"),
               a_par(it["capture"], 1300, "888888", align="ctr"),
               a_par("(insérer la copie d’écran ici)", 1100, "AAAAAA", align="ctr")]
        ph = (f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="placeholder"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
              f'<p:spPr><a:xfrm><a:off x="6250000" y="1300000"/><a:ext cx="5400000" cy="4700000"/></a:xfrm>'
              f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="F4F4F4"/></a:solidFill>{ph_line}</p:spPr>'
              f'<p:txBody><a:bodyPr anchor="ctr"><a:normAutofit/></a:bodyPr><a:lstStyle/>{"".join(cap)}</p:txBody></p:sp>')
        shapes.append(ph)
    return (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<p:sld xmlns:a="{A}" xmlns:r="{REL}" xmlns:p="{PML}"><p:cSld><p:spTree>'
            f'<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
            f'<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
            f'{"".join(shapes)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>')

def build_pptx(path):
    n = len(CONTENT)
    theme = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="{A}" name="Office"><a:themeElements>
<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
<a:accent1><a:srgbClr val="D81E2C"/></a:accent1><a:accent2><a:srgbClr val="F2B632"/></a:accent2><a:accent3><a:srgbClr val="0E7A45"/></a:accent3>
<a:accent4><a:srgbClr val="9B0F1E"/></a:accent4><a:accent5><a:srgbClr val="766164"/></a:accent5><a:accent6><a:srgbClr val="1E1416"/></a:accent6>
<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Office">
<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
</a:fmtScheme></a:themeElements></a:theme>'''

    empty_tree = ('<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
                  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>')
    master = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              f'<p:sldMaster xmlns:a="{A}" xmlns:r="{REL}" xmlns:p="{PML}"><p:cSld>'
              f'<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>{empty_tree}</p:cSld>'
              f'<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
              f'<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>')
    master_rels = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   f'<Relationship Id="rId1" Type="{REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
                   f'<Relationship Id="rId2" Type="{REL}/theme" Target="../theme/theme1.xml"/></Relationships>')
    layout = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              f'<p:sldLayout xmlns:a="{A}" xmlns:r="{REL}" xmlns:p="{PML}" type="blank" preserve="1">'
              f'<p:cSld name="Vierge">{empty_tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>')
    layout_rels = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   f'<Relationship Id="rId1" Type="{REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>')
    slide_rels = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                  f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                  f'<Relationship Id="rId1" Type="{REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>')

    sld_ids = "".join(f'<p:sldId id="{256+i}" r:id="rId{i+1}"/>' for i in range(n))
    presentation = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                    f'<p:presentation xmlns:a="{A}" xmlns:r="{REL}" xmlns:p="{PML}">'
                    f'<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdM"/></p:sldMasterIdLst>'
                    f'<p:sldIdLst>{sld_ids}</p:sldIdLst>'
                    f'<p:sldSz cx="{SW}" cy="{SH}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>')
    pres_rels_items = [f'<Relationship Id="rId{i+1}" Type="{REL}/slide" Target="slides/slide{i+1}.xml"/>' for i in range(n)]
    pres_rels_items.append(f'<Relationship Id="rIdM" Type="{REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>')
    # NB: the theme is related from the slideMaster (not the presentation) — per the OOXML schema.
    pres_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 + "".join(pres_rels_items) + "</Relationships>")

    ct_items = "".join(
        f'<Override PartName="/ppt/slides/slide{i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        for i in range(n))
    ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          '<Default Extension="xml" ContentType="application/xml"/>'
          '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
          '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
          '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
          '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
          + ct_items + '</Types>')
    root_rels = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 f'<Relationship Id="rId1" Type="{REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>')

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("ppt/presentation.xml", presentation)
        z.writestr("ppt/_rels/presentation.xml.rels", pres_rels)
        z.writestr("ppt/theme/theme1.xml", theme)
        z.writestr("ppt/slideMasters/slideMaster1.xml", master)
        z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", master_rels)
        z.writestr("ppt/slideLayouts/slideLayout1.xml", layout)
        z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", layout_rels)
        for i, it in enumerate(CONTENT):
            z.writestr(f"ppt/slides/slide{i+1}.xml", slide_xml(it))
            z.writestr(f"ppt/slides/_rels/slide{i+1}.xml.rels", slide_rels)

if __name__ == "__main__":
    docx_path = os.path.join(OUT, "Guide-utilisateur-Carte-Promote.docx")
    pptx_path = os.path.join(OUT, "Guide-utilisateur-Carte-Promote.pptx")
    build_docx(docx_path)
    build_pptx(pptx_path)
    print("Écrit :", docx_path)
    print("Écrit :", pptx_path)
    print("Slides/sections :", len(CONTENT))
