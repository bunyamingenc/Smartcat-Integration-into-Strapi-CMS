// src/components/StatusBadge.jsx
const MAP = {
  not_started: { label: "Not started", cls: "badge-gray"   },
  registered:  { label: "Registered",  cls: "badge-gray"   },
  uploaded:    { label: "Sent",        cls: "badge-blue"   },
  translating: { label: "Translating", cls: "badge-yellow" },
  inprogress:  { label: "In progress", cls: "badge-yellow" },
  created:     { label: "In progress", cls: "badge-yellow" },
  partial:     { label: "Partial",     cls: "badge-yellow" },
  ready:       { label: "Ready",       cls: "badge-green"  },
  completed:   { label: "Complete",    cls: "badge-green"  },
  synced:      { label: "Synced ✓",    cls: "badge-green"  },
  timeout:     { label: "Timed out",   cls: "badge-red"    },
  error:       { label: "Error",       cls: "badge-red"    },
  unknown:     { label: "Unknown",     cls: "badge-gray"   },
};
export default function StatusBadge({ status }) {
  const key = (status || "not_started").toLowerCase().replace(/[\s-]/g, "_");
  const cfg = MAP[key] ?? { label: status ?? "—", cls: "badge-gray" };
  return <span className={`badge ${cfg.cls}`}>{cfg.label}</span>;
}
