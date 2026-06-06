package com.afriland.promote.receipt;

import net.sourceforge.tess4j.ITesseract;
import net.sourceforge.tess4j.Tesseract;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;

/**
 * Turns an uploaded SARA receipt (PDF or image) into the structured {@link SaraReceipt}.
 *
 * <p>Strategy:
 * <ul>
 *   <li><b>PDF</b> — read the text layer with PDFBox. If it is empty (an image-only PDF, e.g.
 *       a photo exported to PDF), render each page and OCR it.</li>
 *   <li><b>Image</b> — OCR directly with Tesseract.</li>
 * </ul>
 *
 * Everything is best-effort: any failure (missing Tesseract native lib, unreadable file)
 * is logged and yields an empty result, so subscription creation never breaks — the agent
 * simply types the values in by hand at the point of sale.
 */
@Component
public class SaraReceiptExtractor {

    private static final Logger log = LoggerFactory.getLogger(SaraReceiptExtractor.class);

    /** Below this many characters, a PDF's text layer is treated as "empty" → fall back to OCR. */
    private static final int MIN_TEXT_LEN = 40;

    private final SaraReceiptParser parser;

    @Value("${app.receipt.ocr.enabled:true}")
    private boolean ocrEnabled;
    @Value("${app.receipt.ocr.lang:fra}")
    private String ocrLang;
    /** Tesseract tessdata directory. Empty → rely on the TESSDATA_PREFIX env var. */
    @Value("${app.receipt.ocr.datapath:}")
    private String ocrDatapath;
    @Value("${app.receipt.ocr.dpi:300}")
    private int pdfDpi;

    public SaraReceiptExtractor(SaraReceiptParser parser) {
        this.parser = parser;
    }

    /** Extract the receipt fields from raw bytes; never throws. */
    public SaraReceipt extract(byte[] data, String contentType) {
        if (data == null || data.length == 0) return SaraReceipt.EMPTY;
        try {
            String text = isPdf(contentType) ? fromPdf(data) : fromImage(data);
            SaraReceipt r = parser.parse(text);
            if (r.isEmpty()) log.warn("SARA receipt: nothing extracted (contentType={}, {} bytes)", contentType, data.length);
            return r;
        } catch (Throwable t) {
            // Throwable: also catch UnsatisfiedLinkError / NoClassDefFoundError when the
            // Tesseract native library is absent — degrade to manual entry instead of failing.
            log.warn("SARA receipt extraction failed (contentType={}): {}", contentType, t.toString());
            return SaraReceipt.EMPTY;
        }
    }

    private static boolean isPdf(String contentType) {
        return contentType != null && contentType.toLowerCase().contains("pdf");
    }

    private String fromPdf(byte[] data) throws Exception {
        try (PDDocument doc = PDDocument.load(data)) {
            String text = new PDFTextStripper().getText(doc);
            if (text != null && text.strip().length() >= MIN_TEXT_LEN) return text;
            if (!ocrEnabled) return text;
            // No usable text layer → render each page and OCR it.
            ITesseract tess = newTesseract();
            PDFRenderer renderer = new PDFRenderer(doc);
            StringBuilder sb = new StringBuilder();
            for (int page = 0; page < doc.getNumberOfPages(); page++) {
                BufferedImage img = renderer.renderImageWithDPI(page, pdfDpi);
                sb.append(tess.doOCR(img)).append('\n');
            }
            return sb.toString();
        }
    }

    private String fromImage(byte[] data) throws Exception {
        if (!ocrEnabled) return "";
        BufferedImage img = ImageIO.read(new ByteArrayInputStream(data));
        if (img == null) throw new IllegalArgumentException("unreadable image");
        return newTesseract().doOCR(img);
    }

    /** A fresh Tesseract instance (the engine is not thread-safe, so we never share one). */
    private ITesseract newTesseract() {
        ITesseract tess = new Tesseract();
        if (ocrDatapath != null && !ocrDatapath.isBlank()) tess.setDatapath(ocrDatapath);
        tess.setLanguage(ocrLang);
        return tess;
    }
}
