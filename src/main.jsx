import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import FragmentViewer from "./FragmentViewer.jsx";

const root = createRoot(document.getElementById("root"));
root.render(<FragmentViewer />);
