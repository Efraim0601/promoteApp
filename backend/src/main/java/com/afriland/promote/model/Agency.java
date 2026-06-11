package com.afriland.promote.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * A pickup point ("lieu de retrait") the client can choose when {@code delivery == agence}:
 * a physical Afriland branch where the printed Promote card is collected. The list is managed
 * by the admin (bulk import) and exposed to the public subscription form.
 */
@Entity
@Table(name = "agency", indexes = {
        @Index(name = "idx_agency_active", columnList = "active"),
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Agency {

    @Id
    private String id;          // e.g. "ag-1a2b3c4d"

    @Column(nullable = false)
    private String name;        // branch name, e.g. "Agence Yaoundé Centre"

    private String city;        // city / town (optional, helps the client disambiguate)

    /** Soft on/off switch — an inactive agency is hidden from the client form but kept for history. */
    @Column(nullable = false)
    private boolean active;

    @Column(nullable = false)
    private Instant createdAt;
}
