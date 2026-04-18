// src/components/print_styles.jsx
// Issue #13 Phase C.3: Global print-only stylesheet.
//
// Two concerns:
//   1. Default print view — hide toolbar/sidebar chrome (.no-print), expand
//      the main pane, force white backgrounds. Triggered by window.print()
//      from AutoClassifyTab's Print-to-PDF button.
//   2. Report-modal print isolation — the ReportModal is portaled to
//      document.body via createPortal, so it's a direct child of <body>.
//      When body gets .fv-report-printing we hide all its other direct
//      children and flatten the modal to full-page flow. The non-universal
//      selectors below target only the first two container levels so SVG
//      <rect height="..."> attributes survive (SVG2 CSS Geometry Properties
//      make universal { height: auto } win over the SVG presentation attr,
//      collapsing every figure to zero height).

function PrintStyles() {
  return (
    <style>{`
      @media print {
        .no-print { display: none !important; }
        body, html { background: white !important; }
        .h-screen { height: auto !important; min-height: auto !important; background: white !important; }
        main { overflow: visible !important; border: none !important; }
        button, input[type="number"], input[type="file"], select, textarea { display: none !important; }
        .print-show { display: block !important; }
      }

      /* Report-modal print isolation. The modal is portaled to document.body
         via React createPortal, so it's a DIRECT child of body. */
      body.fv-report-printing > *:not(.fv-report-root) { display: none !important; }
      body.fv-report-printing {
        background: white !important;
        height: auto !important;
        min-height: auto !important;
      }
      body.fv-report-printing .fv-report-root {
        position: static !important;
        inset: auto !important;
        width: 100% !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important; padding: 0 !important;
        background: white !important;
        box-shadow: none !important;
        border: none !important;
        overflow: visible !important;
        display: block !important;
      }
      /* Strip scroll clamps on the FIRST TWO container levels only — NOT on
         SVG children. Earlier universal fv-report-root descendant selector
         with height:auto !important overrode SVG rect height attributes
         in SVG2-compliant browsers (CSS beats presentation attrs), collapsing
         every figure to zero height. The targeted selectors below only touch
         the outer modal container + the scroll region that Tailwind put
         max-h + overflow-y-auto on. SVGs stay untouched. */
      body.fv-report-printing .fv-report-root > * {
        position: static !important;
        inset: auto !important;
        max-height: none !important;
        overflow: visible !important;
        max-width: none !important;
        width: 100% !important;
        box-shadow: none !important;
        border-radius: 0 !important;
      }
      body.fv-report-printing .fv-report-root > * > * {
        max-height: none !important;
        overflow: visible !important;
      }
      body.fv-report-printing .fv-report-actions,
      body.fv-report-printing .fv-report-backdrop,
      body.fv-report-printing .fv-report-root .no-print { display: none !important; }
      /* Page break hints for printing */
      body.fv-report-printing .fv-report-root section {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      body.fv-report-printing .fv-report-page-break {
        page-break-before: always;
        break-before: page;
      }
      /* SVGs keep their intrinsic sizing in print. Width constrained to
         available content area so big diagrams (W=1200) scale to fit. */
      body.fv-report-printing .fv-report-root svg {
        max-width: 100% !important;
        height: auto !important;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      @media print {
        html, body { background: white !important; margin: 0 !important; }
        body.fv-report-printing .fv-report-root { padding: 0 !important; }
        @page { size: letter portrait; margin: 0.5in; }
      }
    `}</style>
  );
}

export { PrintStyles };
export default PrintStyles;
