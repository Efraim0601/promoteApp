package com.afriland.promote.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<?> handleResponseStatusException(ResponseStatusException ex) {
        String reason = ex.getReason();
        return ResponseEntity.status(ex.getStatusCode())
                .body(new ErrorResponse(reason != null ? reason : "unknown_error"));
    }

    /** Bean-validation failures (@Valid / @NotBlank / @NotNull) — return a 400 with the first
     *  failing field so the frontend can surface a meaningful error instead of the generic fallback. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<?> handleValidation(MethodArgumentNotValidException ex) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .collect(Collectors.joining(", "));
        log.warn("Validation failure: {}", detail);
        return ResponseEntity.badRequest()
                .body(new ErrorResponse("validation_error"));
    }

    /** A malformed query/path parameter (e.g. {@code ?hours=c} on the reconcile endpoint) is a client
     *  error — return a clean 400 instead of letting it fall through to the 500 catch-all with a stack. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<?> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        log.warn("Invalid request parameter '{}': {}", ex.getName(), ex.getMessage());
        return ResponseEntity.badRequest().body(new ErrorResponse("invalid_parameter"));
    }

    /** The client disconnected before the response was flushed (browser closed, proxy read-timeout on a
     *  slow request). Nothing can be written back, so log quietly rather than as an unhandled 500. */
    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public void handleClientDisconnect(AsyncRequestNotUsableException ex) {
        log.debug("Client disconnected before the response was flushed: {}", ex.getMessage());
    }

    /** Catch-all for unexpected server-side exceptions so the client always gets a JSON body
     *  instead of Spring Boot's HTML/plain-text 500 page. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ErrorResponse("server_error"));
    }

    record ErrorResponse(String error) {}
}
