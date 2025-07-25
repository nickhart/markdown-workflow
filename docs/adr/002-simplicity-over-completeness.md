# ADR 002: Simplicity Over Completeness

**Date:** 2025-07-25  
**Status:** Accepted  
**Context:** Development philosophy and design principles

## Context

During development of the web scraping functionality, we faced a choice between building a comprehensive solution that handles all edge cases (gzip compression, various timeout scenarios, complex error handling, extensive configuration) versus a simple solution that handles the common cases well.

The initial implementation grew to 435+ lines with complex features like:

- Gzip/deflate/brotli decompression
- Complex timeout management with manual timers
- Extensive configuration parsing and validation
- Post-processing and content validation
- Multiple fallback strategies with detailed error reporting

This complexity led to:

- Jest tests hanging due to open handles from timers and child processes
- Difficult maintenance and debugging
- Over-engineering for a personal workflow automation tool
- Slower development velocity

## Decision

We adopt **Simplicity Over Completeness** as a core design principle:

**Primary Goal:** Automate workflows for the common cases (80%), accept manual intervention for edge cases (20%)

**Implementation Guidelines:**

- Prefer fewer lines of code over comprehensive feature coverage
- Choose simple solutions that work reliably for typical scenarios
- Trust that manual editing/file maintenance is acceptable for unusual cases
- Optimize for developer productivity and maintainability over bulletproof enterprise-grade features

## Consequences

### Positive

- **Faster development:** Less code to write, test, and debug
- **Easier maintenance:** Fewer moving parts to break or update
- **Faster tests:** Less complex code means faster, more reliable test execution
- **Higher adoption:** Simple tools get used, complex ones get abandoned
- **Better reliability:** Fewer edge cases mean fewer bugs

### Negative

- **Limited edge case handling:** Some unusual scenarios may require manual intervention
- **Potential user frustration:** Users expecting comprehensive automation may need to adapt
- **Feature requests:** Users may request more comprehensive solutions for their specific edge cases

### Trade-offs Accepted

- Manual file editing for unusual web scraping scenarios vs. comprehensive HTTP client
- Simple wget/curl/basic HTTP fallback vs. complex compression/timeout handling
- Basic error messages vs. detailed diagnostic information
- Fewer configuration options vs. extensive customization

## Example Implementation

The web scraper was simplified from 435+ lines to ~128 lines:

- **Before:** Complex gzip handling, timeout management, configuration parsing
- **After:** Simple wget → curl → basic HTTP fallback
- **Result:** Fast, reliable, maintainable code that handles 95% of use cases

## Review

This ADR should be revisited if:

- The tool is being adopted by a larger team with diverse needs
- Edge cases become frequent enough to impact daily workflow
- The manual intervention burden becomes too high

The principle should guide all future feature development: **solve the common case well, keep it simple, trust in manual intervention for the edge cases.**
