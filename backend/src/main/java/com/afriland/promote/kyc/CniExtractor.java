package com.afriland.promote.kyc;

import net.sourceforge.tess4j.ITesseract;
import net.sourceforge.tess4j.Tesseract;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;

/**
 * OCRs the front photo of a national ID card (CNI) into the structured {@link CniData}.
 *
 * <p>Mirrors {@link com.afriland.promote.receipt.SaraReceiptExtractor} but image-only: a CNI
 * capture is always a JPEG/PNG, so we OCR it directly with Tesseract ({@code fra}). Everything
 * is best-effort — any failure (missing Tesseract native lib, unreadable image) is logged and
 * yields {@link CniData#EMPTY}, so the OCR cross-check degrades to "no warning" instead of
 * breaking enrolment.
 *
 * <p>Disabled by default ({@code app.kyc.cni-ocr.enabled=false}) for a cautious rollout; the
 * language/datapath default to the same Tesseract setup already used for SARA receipts.
 */
@Component
public class CniExtractor {

    private static final Logger log = LoggerFactory.getLogger(CniExtractor.class);

    private final CniParser parser;

    @Value("${app.kyc.cni-ocr.enabled:false}")
    private boolean enabled;
    @Value("${app.kyc.cni-ocr.lang:${app.receipt.ocr.lang:fra}}")
    private String ocrLang;
    /** Tesseract tessdata directory; empty → rely on the TESSDATA_PREFIX env var (Docker runtime). */
    @Value("${app.kyc.cni-ocr.datapath:${app.receipt.ocr.datapath:}}")
    private String ocrDatapath;

    public CniExtractor(CniParser parser) {
        this.parser = parser;
    }

    public boolean isEnabled() {
        return enabled;
    }

    /** Extract the CNI fields from raw image bytes; never throws. */
    public CniData extract(byte[] data) {
        if (!enabled || data == null || data.length == 0) return CniData.EMPTY;
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(data));
            if (img == null) throw new IllegalArgumentException("unreadable image");
            CniData d = parser.parse(newTesseract().doOCR(img));
            if (d.isEmpty()) log.warn("CNI OCR: nothing extracted ({} bytes)", data.length);
            return d;
        } catch (Throwable t) {
            // Throwable: also catch UnsatisfiedLinkError / NoClassDefFoundError when the Tesseract
            // native library is absent — degrade to "no cross-check" instead of failing the upload.
            log.warn("CNI OCR extraction failed: {}", t.toString());
            return CniData.EMPTY;
        }
    }

    /** A fresh Tesseract instance (the engine is not thread-safe, so we never share one). */
    private ITesseract newTesseract() {
        ITesseract tess = new Tesseract();
        if (ocrDatapath != null && !ocrDatapath.isBlank()) tess.setDatapath(ocrDatapath);
        tess.setLanguage(ocrLang);
        return tess;
    }
}
