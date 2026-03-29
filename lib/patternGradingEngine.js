const EPSILON = 1e-9;

const MEASUREMENT_ALIASES = {
  collar: ["coller", "neck_circumference", "collar_circumference"],
  coller: ["collar", "neck_circumference", "collar_circumference"],
  chest: ["bust", "upper_chest"],
  waist: ["mid_waist", "waist_circumference"],
  stomach: ["belly", "abdomen"],
  hip: ["seat", "hip_circumference"],
  shoulder: ["shoulder_width"],
  sleeve: ["sleeve_length", "arm_length"],
  length: ["body_length", "shirt_length"],
  armhole: ["armscye"],
  cuff: ["wrist", "cuff_circumference"],
  button_hem: ["hem", "bottom_opening"],
};

export const RULE_AXIS_OPTIONS = [
  "between_refs",
  "perpendicular_refs",
  "x",
  "y",
  "radial",
];

export const RULE_FALLOFF_OPTIONS = ["smooth", "linear", "constant"];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function roundTo(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizeMeasurementKey(raw) {
  if (raw === null || raw === undefined) return "";
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizePartRules(partRules = {}) {
  const normalized = {};
  for (const [rawKey, rule] of Object.entries(partRules || {})) {
    const key = normalizeMeasurementKey(rawKey);
    if (!key) continue;
    const source = rule || {};
    const aliases = Array.isArray(source.aliases)
      ? source.aliases.map((alias) => normalizeMeasurementKey(alias)).filter(Boolean)
      : [];
    normalized[key] = {
      multiplier: Math.max(0.01, toFiniteNumber(source.multiplier, 1)),
      easeInches: toFiniteNumber(source.easeInches ?? source.ease, 0),
      easePercent: toFiniteNumber(source.easePercent, 0),
      seamAllowanceInches: Math.max(
        0,
        toFiniteNumber(source.seamAllowanceInches ?? source.seamAllowance, 0),
      ),
      includeSeamInTarget: Boolean(source.includeSeamInTarget),
      aliases,
    };
  }
  return normalized;
}

function collectCandidateMeasurementKeys(partKey, partRule) {
  const key = normalizeMeasurementKey(partKey);
  const candidates = new Set([key]);
  for (const alias of MEASUREMENT_ALIASES[key] || []) {
    const normalizedAlias = normalizeMeasurementKey(alias);
    if (normalizedAlias) candidates.add(normalizedAlias);
  }
  if (Array.isArray(partRule?.aliases)) {
    for (const alias of partRule.aliases) {
      const normalizedAlias = normalizeMeasurementKey(alias);
      if (normalizedAlias) candidates.add(normalizedAlias);
    }
  }
  return [...candidates];
}

export function buildEmployeeMeasurementMap(employeeMeasurements = []) {
  const map = {};
  for (const item of employeeMeasurements || []) {
    const rawName =
      item?.measurementName ?? item?.name ?? item?.key ?? item?.measurement ?? "";
    const key = normalizeMeasurementKey(rawName);
    if (!key) continue;
    const value = toFiniteNumber(
      item?.value ?? item?.measurementValue ?? item?.inches ?? item?.targetFullInches,
      NaN,
    );
    if (!Number.isFinite(value)) continue;
    map[key] = value;
  }
  return map;
}

function resolveMeasurementValue(measurementMap, partKey, partRule) {
  const keys = collectCandidateMeasurementKeys(partKey, partRule);
  for (const key of keys) {
    if (Number.isFinite(measurementMap[key])) return measurementMap[key];
  }
  return null;
}

export function buildGroupTargetsFromMeasurements({
  measureGroups = [],
  employeeMeasurements = [],
  partRulesMap = {},
}) {
  const normalizedRules = normalizePartRules(partRulesMap);
  const measurementMap = buildEmployeeMeasurementMap(employeeMeasurements);
  return (measureGroups || []).map((group) => {
    const normalizedPartKey = normalizeMeasurementKey(group?.partKey);
    const partRule = normalizedRules[normalizedPartKey] || {
      multiplier: Math.max(0.01, toFiniteNumber(group?.multiplier, 1)),
      easeInches: 0,
      easePercent: 0,
      seamAllowanceInches: 0,
      includeSeamInTarget: false,
      aliases: [],
    };
    const employeeValue = resolveMeasurementValue(
      measurementMap,
      group?.partKey,
      partRule,
    );
    const baseFullInches =
      toFiniteNumber(group?.baseFullInches, NaN) ||
      toFiniteNumber(group?.targetFullInches, 0);
    const measurementOffset = toFiniteNumber(group?.measurementOffset, 0);
    const sourceValue = Number.isFinite(employeeValue) ? employeeValue : baseFullInches;

    const easeInches = toFiniteNumber(partRule.easeInches, 0);
    const easePercent = toFiniteNumber(partRule.easePercent, 0);
    const seamAllowanceInches = toFiniteNumber(partRule.seamAllowanceInches, 0);

    const easedValue = sourceValue + easeInches + sourceValue * (easePercent / 100);
    const seamAdjusted = partRule.includeSeamInTarget
      ? easedValue + seamAllowanceInches
      : easedValue;
    const targetFullInches = roundTo(seamAdjusted, 4);

    return {
      groupClientId: group?.clientId || group?.id,
      groupName: group?.name,
      partKey: group?.partKey,
      assignedSize: group?.assignedSize || null,
      multiplier: Math.max(0.01, toFiniteNumber(group?.multiplier, partRule.multiplier)),
      baseFullInches: roundTo(baseFullInches, 4),
      targetFullInches,
      hasEmployeeData: Number.isFinite(employeeValue),
      employeeValue: Number.isFinite(employeeValue) ? roundTo(employeeValue, 4) : null,
      measurementOffsetInches: roundTo(measurementOffset, 4),
      appliedEaseInches: roundTo(easeInches, 4),
      appliedEasePercent: roundTo(easePercent, 4),
      appliedSeamAllowanceInches: roundTo(
        partRule.includeSeamInTarget ? seamAllowanceInches : 0,
        4,
      ),
      source: Number.isFinite(employeeValue) ? "employee" : "fallback",
    };
  });
}

const ZERO_DELTA = {
  dx: 0,
  dy: 0,
  dc1x: 0,
  dc1y: 0,
  dc2x: 0,
  dc2y: 0,
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function calculateKeyframeNodeOffsets({
  groupId,
  keyframes = [],
  targetFullInches,
  baseFullInches,
  extrapolationClamp = { min: -6, max: 7 },
}) {
  const groupKeyframes = (keyframes || [])
    .filter((keyframe) => String(keyframe.gid) === String(groupId))
    .sort((a, b) => toFiniteNumber(a.targetFullInches, 0) - toFiniteNumber(b.targetFullInches, 0));

  if (!groupKeyframes.length) {
    return {
      ok: false,
      reason: "missing_keyframes",
      nodeOffsets: {},
      isExtrapolating: false,
      interpolation: 0,
    };
  }

  const safeBase =
    toFiniteNumber(baseFullInches, NaN) ||
    toFiniteNumber(groupKeyframes[0].targetFullInches, 0);
  const zeroKeyframe = {
    id: "__base__",
    gid: groupId,
    targetFullInches: safeBase,
    deltas: [],
  };
  const all = [zeroKeyframe, ...groupKeyframes].sort(
    (a, b) => toFiniteNumber(a.targetFullInches, 0) - toFiniteNumber(b.targetFullInches, 0),
  );

  let low;
  let high;
  if (targetFullInches <= toFiniteNumber(all[0].targetFullInches, 0)) {
    low = all[0];
    high = all[Math.min(1, all.length - 1)];
  } else if (targetFullInches >= toFiniteNumber(all[all.length - 1].targetFullInches, 0)) {
    low = all[Math.max(0, all.length - 2)];
    high = all[all.length - 1];
  } else {
    for (let i = 0; i < all.length - 1; i += 1) {
      const left = toFiniteNumber(all[i].targetFullInches, 0);
      const right = toFiniteNumber(all[i + 1].targetFullInches, 0);
      if (left <= targetFullInches && right >= targetFullInches) {
        low = all[i];
        high = all[i + 1];
        break;
      }
    }
  }

  if (!low || !high) {
    return {
      ok: false,
      reason: "missing_bracket",
      nodeOffsets: {},
      isExtrapolating: false,
      interpolation: 0,
    };
  }

  const span =
    toFiniteNumber(high.targetFullInches, 0) - toFiniteNumber(low.targetFullInches, 0);
  const interpolation =
    Math.abs(span) > EPSILON
      ? clamp(
          (targetFullInches - toFiniteNumber(low.targetFullInches, 0)) / span,
          extrapolationClamp.min,
          extrapolationClamp.max,
        )
      : 0;

  const nodeOffsets = {};
  const deltaKeys = new Set();
  for (const delta of low.deltas || []) deltaKeys.add(`${delta.pi},${delta.si}`);
  for (const delta of high.deltas || []) deltaKeys.add(`${delta.pi},${delta.si}`);

  for (const key of deltaKeys) {
    const [pi, si] = key.split(",").map(Number);
    const lowDelta =
      (low.deltas || []).find((delta) => delta.pi === pi && delta.si === si) || ZERO_DELTA;
    const highDelta =
      (high.deltas || []).find((delta) => delta.pi === pi && delta.si === si) || ZERO_DELTA;
    nodeOffsets[key] = {
      dx: lerp(toFiniteNumber(lowDelta.dx, 0), toFiniteNumber(highDelta.dx, 0), interpolation),
      dy: lerp(toFiniteNumber(lowDelta.dy, 0), toFiniteNumber(highDelta.dy, 0), interpolation),
      dc1x: lerp(
        toFiniteNumber(lowDelta.dc1x, 0),
        toFiniteNumber(highDelta.dc1x, 0),
        interpolation,
      ),
      dc1y: lerp(
        toFiniteNumber(lowDelta.dc1y, 0),
        toFiniteNumber(highDelta.dc1y, 0),
        interpolation,
      ),
      dc2x: lerp(
        toFiniteNumber(lowDelta.dc2x, 0),
        toFiniteNumber(highDelta.dc2x, 0),
        interpolation,
      ),
      dc2y: lerp(
        toFiniteNumber(lowDelta.dc2y, 0),
        toFiniteNumber(highDelta.dc2y, 0),
        interpolation,
      ),
    };
  }

  const minTarget = toFiniteNumber(all[0].targetFullInches, 0);
  const maxTarget = toFiniteNumber(all[all.length - 1].targetFullInches, 0);
  return {
    ok: true,
    reason: "ok",
    nodeOffsets,
    interpolation,
    lowTarget: toFiniteNumber(low.targetFullInches, 0),
    highTarget: toFiniteNumber(high.targetFullInches, 0),
    isExtrapolating: targetFullInches < minTarget || targetFullInches > maxTarget,
  };
}

function getNodeFromRef(paths, ref) {
  return paths?.[ref?.pathIdx]?.segs?.[ref?.segIdx];
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= EPSILON) return { x: 1, y: 0 };
  return { x: vector.x / length, y: vector.y / length };
}

function deriveAxisVector(axis, ref1Node, ref2Node) {
  if (axis === "x") return { x: 1, y: 0 };
  if (axis === "y") return { x: 0, y: 1 };

  const fallback = { x: 1, y: 0 };
  if (!ref1Node || !ref2Node) return fallback;

  const dx = ref2Node.x - ref1Node.x;
  const dy = ref2Node.y - ref1Node.y;
  const between = normalizeVector({ x: dx, y: dy });
  if (axis === "perpendicular_refs") return normalizeVector({ x: -between.y, y: between.x });
  return between;
}

function normalizeRuleProfile(ruleProfile = {}) {
  const axis = RULE_AXIS_OPTIONS.includes(ruleProfile.axis)
    ? ruleProfile.axis
    : "between_refs";
  const falloff = RULE_FALLOFF_OPTIONS.includes(ruleProfile.falloff)
    ? ruleProfile.falloff
    : "smooth";
  return {
    axis,
    falloff,
    gain: toFiniteNumber(ruleProfile.gain, 1),
    handleGain: toFiniteNumber(ruleProfile.handleGain, 1),
    influenceRadiusInches: Math.max(0.25, toFiniteNumber(ruleProfile.influenceRadiusInches, 6)),
    invert: Boolean(ruleProfile.invert),
    limitToReferencePaths:
      ruleProfile.limitToReferencePaths === undefined
        ? true
        : Boolean(ruleProfile.limitToReferencePaths),
    influenceNodes: Array.isArray(ruleProfile.influenceNodes)
      ? ruleProfile.influenceNodes
      : [],
  };
}

function calculateWeight({ falloff, distance, radiusUnits }) {
  const ratio = clamp(distance / Math.max(radiusUnits, EPSILON), 0, 2);
  if (falloff === "constant") return distance <= radiusUnits ? 1 : 0;
  if (falloff === "linear") return clamp(1 - ratio, 0, 1);
  return clamp(1 - ratio * ratio, 0, 1);
}

function pushOffset(offsetMap, key, value) {
  const current = offsetMap[key] || ZERO_DELTA;
  offsetMap[key] = {
    dx: current.dx + value.dx,
    dy: current.dy + value.dy,
    dc1x: current.dc1x + value.dc1x,
    dc1y: current.dc1y + value.dc1y,
    dc2x: current.dc2x + value.dc2x,
    dc2y: current.dc2y + value.dc2y,
  };
}

function collectCandidateNodes(paths, group, profile) {
  const candidates = [];
  const explicitInfluences = profile.influenceNodes || [];
  if (explicitInfluences.length > 0) {
    for (const ref of explicitInfluences) {
      const pathIndex = toFiniteNumber(ref.pi, NaN);
      const segmentIndex = toFiniteNumber(ref.si, NaN);
      if (!Number.isFinite(pathIndex) || !Number.isFinite(segmentIndex)) continue;
      const node = paths?.[pathIndex]?.segs?.[segmentIndex];
      if (!node || node.t === "Z") continue;
      candidates.push({
        pi: pathIndex,
        si: segmentIndex,
        node,
        explicitWeight: toFiniteNumber(ref.weight, 1),
      });
    }
    return candidates;
  }

  const pathFilter = new Set();
  if (profile.limitToReferencePaths) {
    pathFilter.add(group?.ref1?.pathIdx);
    pathFilter.add(group?.ref2?.pathIdx);
  }

  for (let pi = 0; pi < (paths || []).length; pi += 1) {
    const path = paths[pi];
    if (!path || path.isConnector) continue;
    if (profile.limitToReferencePaths && !pathFilter.has(pi)) continue;
    const segs = path.segs || [];
    for (let si = 0; si < segs.length; si += 1) {
      const node = segs[si];
      if (!node || node.t === "Z") continue;
      candidates.push({ pi, si, node, explicitWeight: null });
    }
  }
  return candidates;
}

function resolveGroupBaseFullInches(group, fallbackTarget) {
  const explicitBase = toFiniteNumber(group?.baseFullInches, NaN);
  if (Number.isFinite(explicitBase) && explicitBase > 0) return explicitBase;
  return toFiniteNumber(fallbackTarget, 0);
}

export function calculateRuleBasedNodeOffsets({
  group,
  targetFullInches,
  basePaths = [],
  unitsPerInch = 25.4,
}) {
  const profile = normalizeRuleProfile(group?.ruleProfile || {});
  const ref1 = getNodeFromRef(basePaths, group?.ref1);
  const ref2 = getNodeFromRef(basePaths, group?.ref2);
  const baseFullInches = resolveGroupBaseFullInches(group, targetFullInches);
  const deltaFullInches = toFiniteNumber(targetFullInches, 0) - baseFullInches;
  const deltaUnits = deltaFullInches * toFiniteNumber(unitsPerInch, 25.4);
  if (Math.abs(deltaUnits) <= EPSILON) {
    return {
      ok: true,
      reason: "no_delta",
      nodeOffsets: {},
      movedNodes: 0,
      deltaFullInches: 0,
    };
  }

  const axisVector = deriveAxisVector(profile.axis, ref1, ref2);
  const center = {
    x: ref1 && ref2 ? (ref1.x + ref2.x) / 2 : ref1?.x || ref2?.x || 0,
    y: ref1 && ref2 ? (ref1.y + ref2.y) / 2 : ref1?.y || ref2?.y || 0,
  };
  const radiusUnits =
    Math.max(0.25, toFiniteNumber(profile.influenceRadiusInches, 6)) *
    toFiniteNumber(unitsPerInch, 25.4);
  const directionMultiplier = profile.invert ? -1 : 1;

  const candidates = collectCandidateNodes(basePaths, group, profile);
  if (!candidates.length) {
    return {
      ok: false,
      reason: "no_nodes",
      nodeOffsets: {},
      movedNodes: 0,
      deltaFullInches,
    };
  }

  const nodeOffsets = {};
  let movedNodes = 0;
  const magnitude = deltaUnits * profile.gain * directionMultiplier;

  for (const candidate of candidates) {
    const key = `${candidate.pi},${candidate.si}`;
    const distance = Math.hypot(candidate.node.x - center.x, candidate.node.y - center.y);
    const weight =
      candidate.explicitWeight !== null
        ? toFiniteNumber(candidate.explicitWeight, 1)
        : calculateWeight({
            falloff: profile.falloff,
            distance,
            radiusUnits,
          });

    const isReferenceNode =
      (candidate.pi === group?.ref1?.pathIdx && candidate.si === group?.ref1?.segIdx) ||
      (candidate.pi === group?.ref2?.pathIdx && candidate.si === group?.ref2?.segIdx);
    const resolvedWeight = isReferenceNode ? Math.max(1, weight) : weight;
    if (resolvedWeight <= EPSILON) continue;

    let vector = axisVector;
    if (profile.axis === "radial") {
      vector = normalizeVector({
        x: candidate.node.x - center.x,
        y: candidate.node.y - center.y,
      });
    }

    const dx = magnitude * resolvedWeight * vector.x;
    const dy = magnitude * resolvedWeight * vector.y;
    pushOffset(nodeOffsets, key, {
      dx,
      dy,
      dc1x: dx * profile.handleGain,
      dc1y: dy * profile.handleGain,
      dc2x: dx * profile.handleGain,
      dc2y: dy * profile.handleGain,
    });
    movedNodes += 1;
  }

  return {
    ok: true,
    reason: "ok",
    nodeOffsets,
    movedNodes,
    deltaFullInches: roundTo(deltaFullInches, 4),
  };
}

export function mergeNodeOffsetMaps(...offsetMaps) {
  const merged = {};
  for (const map of offsetMaps) {
    if (!map) continue;
    for (const [key, value] of Object.entries(map)) {
      pushOffset(merged, key, {
        dx: toFiniteNumber(value.dx, 0),
        dy: toFiniteNumber(value.dy, 0),
        dc1x: toFiniteNumber(value.dc1x, 0),
        dc1y: toFiniteNumber(value.dc1y, 0),
        dc2x: toFiniteNumber(value.dc2x, 0),
        dc2y: toFiniteNumber(value.dc2y, 0),
      });
    }
  }
  return merged;
}

export function resolveGroupGradingMode(group, keyframesForGroup = []) {
  const explicitMode = String(group?.gradingMode || "").toLowerCase();
  if (explicitMode === "rule" || explicitMode === "keyframe") return explicitMode;
  if (group?.ruleProfile?.enabled && keyframesForGroup.length === 0) return "rule";
  if (keyframesForGroup.length > 0) return "keyframe";
  return group?.ruleProfile?.enabled ? "rule" : "keyframe";
}
