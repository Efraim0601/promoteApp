package com.afriland.promote.model;

/** Staff roles for RBAC. The client (self / QR) path is anonymous, so it has no role. */
public enum Role {
    ADMIN,        // Direction Promote — global view, configuration
    MANAGER,      // Manager — configure produits/promotions/commissions, crée les utilisateurs, vue commerciale globale
    AGENT,        // Chargé de clientèle — assisted subscriptions, own sales, QR claim
    PRINT_AGENT,  // Point d'impression — retrieve KYC file by reference, print/hand over
    CASHIER,      // Caissier — retrouve une souscription et valide l'encaissement en espèces
    COLLECTEUR,   // Collecteur — saisit les ventes de produits bancaires (collectes), voit les siennes
    SUPERVISEUR,  // Superviseur — vue des statistiques des chefs d'équipe de son sous-arbre
    CHEF_EQUIPE   // Chef d'équipe — vue des statistiques de sa seule équipe, roster + messagerie
}
