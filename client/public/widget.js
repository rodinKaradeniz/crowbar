(function () {
  "use strict";

  // Find the script tag that loaded this widget
  var scripts = document.querySelectorAll("script[data-business]");
  var scriptTag = scripts[scripts.length - 1];
  if (!scriptTag) return;

  var businessSlug = scriptTag.getAttribute("data-business");
  if (!businessSlug) return;

  var origin = scriptTag.src
    ? scriptTag.src.replace(/\/widget\.js.*$/, "")
    : window.location.origin;

  // Inject styles
  var style = document.createElement("style");
  style.textContent = [
    "#crowbar-widget-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#6366f1;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;transition:background 0.2s;}",
    "#crowbar-widget-btn:hover{background:#4f46e5;}",
    "#crowbar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999999;align-items:center;justify-content:center;padding:16px;}",
    "#crowbar-overlay.open{display:flex;}",
    "#crowbar-modal{background:#fff;border-radius:12px;width:100%;max-width:520px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 50px rgba(0,0,0,0.25);}",
    "#crowbar-modal-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb;}",
    "#crowbar-modal-title{font-size:14px;font-weight:600;color:#111827;font-family:inherit;}",
    "#crowbar-close-btn{background:none;border:none;cursor:pointer;padding:4px;color:#6b7280;font-size:20px;line-height:1;}",
    "#crowbar-close-btn:hover{color:#111827;}",
    "#crowbar-iframe{flex:1;border:none;width:100%;min-height:480px;}",
  ].join("");
  document.head.appendChild(style);

  // Create button
  var btn = document.createElement("button");
  btn.id = "crowbar-widget-btn";
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Book Now';
  scriptTag.parentNode.insertBefore(btn, scriptTag.nextSibling);

  // Create overlay + modal
  var overlay = document.createElement("div");
  overlay.id = "crowbar-overlay";

  var modal = document.createElement("div");
  modal.id = "crowbar-modal";

  var header = document.createElement("div");
  header.id = "crowbar-modal-header";

  var title = document.createElement("span");
  title.id = "crowbar-modal-title";
  title.textContent = "Book a reservation";

  var closeBtn = document.createElement("button");
  closeBtn.id = "crowbar-close-btn";
  closeBtn.innerHTML = "&times;";
  closeBtn.setAttribute("aria-label", "Close");

  header.appendChild(title);
  header.appendChild(closeBtn);

  var iframe = document.createElement("iframe");
  iframe.id = "crowbar-iframe";
  iframe.title = "Crowbar booking widget";
  iframe.setAttribute("loading", "lazy");

  modal.appendChild(header);
  modal.appendChild(iframe);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Open / close
  function openWidget() {
    iframe.src = origin + "/reserve/" + businessSlug + "?widget=1";
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeWidget() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(function () { iframe.src = ""; }, 300);
  }

  btn.addEventListener("click", openWidget);
  closeBtn.addEventListener("click", closeWidget);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeWidget();
  });

  // Listen for postMessage close signal from the iframe
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "crowbar:close") closeWidget();
  });

  // Keyboard close
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeWidget();
  });
})();
