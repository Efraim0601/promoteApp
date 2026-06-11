package com.afriland.promote.model;

/** Staff roles for RBAC. The client (self / QR) path is anonymous, so it has no role. */
public enum Role {
    ADMIN,        // Direction Promote — global view, configuration
    AGENT,        // Chargé de clientèle — assisted subscriptions, own sales, QR claim
    PRINT_AGENT,  // Point d'impression — retrieve KYC file by reference, print/hand over
    CASHIER,      // Caissier — retrouve une souscription et valide l'encaissement en espèces
    COLLECTEUR,   // Collecteur — saisit les ventes de produits bancaires (collectes), voit les siennes
    SUPERVISEUR   // Superviseur collecte — vue dédiée des statistiques globales de collecte (hors admin)
}
