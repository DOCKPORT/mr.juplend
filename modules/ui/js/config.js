/**
 * @file Browser configuration for Mr. Juplend.
 *
 * The read-only Turso token is public by design. It can read this one
 * database, and nothing else. Do not put the write token here.
 */

(() => {
  "use strict";

  /** @type {Window & { MRJUPLEND?: Record<string, unknown> }} */
  const page = window;
  const ns = page.MRJUPLEND || (page.MRJUPLEND = {});

  ns.config = {
    tursoUrl: "libsql://mrjuplend-dockport.aws-us-east-1.turso.io",
    readToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicm8iLCJpYXQiOjE3OTUzMzMwOTYsImlkIjoiMDFhMjAyMmEtNjQwMS03MzZkLWE3ODktOTUxMDM1MzYzYTllIiwia2lkIjoiRTc0QXRYZEVCZDh0UjJrampINUd2OEgyaFBBaU1FaUZuRlJVVWhrMlJyQSIsInJpZCI6ImExOGZjMDBlLTQzMjktNDAyNi04MTFhLTJkMDU5ODcxZTM0ZSJ9.cDE49TXObsBBEIfogEbhFIURh8pEHJ8WUUeBiqMbF5OaiCfZBj6p-eflW0IKlrqcdoekgl0ZhBR5K_pdwq7BDw",
  };
})();
