package com.afriland.promote.repo;

import com.afriland.promote.model.CommissionEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CommissionEntryRepository extends JpaRepository<CommissionEntry, Long> {
    boolean existsBySaleTypeAndSaleRefAndBeneficiaryId(
            CommissionEntry.SaleType saleType, String saleRef, String beneficiaryId);
    List<CommissionEntry> findByBeneficiaryIdOrderByCreatedAtDesc(String beneficiaryId);
    List<CommissionEntry> findByBeneficiaryIdIn(List<String> beneficiaryIds);
    List<CommissionEntry> findAllByOrderByCreatedAtDesc();
}
