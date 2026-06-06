# ---- build stage ----
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B clean package -DskipTests

# ---- runtime stage ----
FROM eclipse-temurin:17-jre
WORKDIR /app

# SARA receipt OCR: Tesseract engine + French language data (Tess4J loads libtesseract via JNA),
# plus the font/render libs PDFBox needs to rasterise image-only PDFs. A version-independent
# symlink to the tessdata directory keeps the OCR datapath stable across base-image upgrades.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-fra libfreetype6 fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s "$(dirname "$(dpkg -L tesseract-ocr-fra | grep fra.traineddata | head -1)")" /opt/tessdata
ENV TESSDATA_PREFIX=/opt/tessdata
ENV APP_RECEIPT_OCR_DATAPATH=/opt/tessdata

# non-root runtime user
RUN useradd -r -u 1001 spring && mkdir -p /app && chown spring:spring /app
USER spring
COPY --from=build /app/target/promote-backend-*.jar app.jar
EXPOSE 8390
ENTRYPOINT ["java", "-Djava.awt.headless=true", "-jar", "/app/app.jar"]
