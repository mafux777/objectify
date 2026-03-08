/**
 * Bundled template data — fallback for when Supabase is unreachable
 * or when running locally without auth.
 */
import type { Template } from "./types.js";

import objectifyWorkflowData from "../../data/objectify-workflow.json";
import sizeCalibrationData from "../../data/size-calibration.json";
import textCapacityData from "../../data/text-capacity.json";
import exampleAData from "../../data/example-a-microservices.json";
import exampleBData from "../../data/example-b-cicd-pipeline.json";
import exampleCData from "../../data/example-c-ecommerce-uml.json";
import sampleData from "../../data/sample.json";
import tradingPipelineData from "../../data/trading-pipeline.json";
import talosComponentsData from "../../data/talos-components.json";
import type { DiagramSpec } from "@objectify/schema";

const ENTRIES: { name: string; description: string; data: unknown; featured: boolean; order: number }[] = [
  { name: "How Objectify Works", description: "Learn the basics of the Objectify diagram editor", data: objectifyWorkflowData, featured: true, order: 0 },
  { name: "Size Calibration Grid", description: "Test how different t-shirt sizes render across shapes", data: sizeCalibrationData, featured: false, order: 1 },
  { name: "Text Capacity Grid", description: "How much Latin text fits in each shape and size combination", data: textCapacityData, featured: false, order: 2 },
  { name: "Web App Architecture", description: "Typical microservices web application architecture", data: exampleAData, featured: false, order: 3 },
  { name: "CI/CD Pipeline", description: "Continuous integration and deployment pipeline", data: exampleBData, featured: false, order: 4 },
  { name: "E-Commerce Components", description: "E-commerce system component diagram", data: exampleCData, featured: false, order: 5 },
  { name: "Project Thunderbattle", description: "Sample project architecture diagram", data: sampleData, featured: false, order: 6 },
  { name: "Trading Pipeline", description: "Financial trading data pipeline", data: tradingPipelineData, featured: false, order: 7 },
  { name: "Talos Linux Components", description: "Talos Linux system components", data: talosComponentsData, featured: false, order: 8 },
];

export const BUNDLED_TEMPLATES: Template[] = ENTRIES.map((e, i) => ({
  id: `bundled-${i}`,
  name: e.name,
  description: e.description,
  spec: e.data as DiagramSpec,
  sortOrder: e.order,
  featured: e.featured,
  createdBy: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
}));
