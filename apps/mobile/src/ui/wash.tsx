import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { blobs, washes, type WashName } from "./tokens";

/**
 * The soft colour field the welcome slides sit on.
 *
 * The reference designs get this from a CSS gradient with a `blur-3xl` blob
 * floating over it. React Native has no filter, and expo-blur over a saturated
 * circle is unreliable on Android — its blur is still behind an experimental
 * flag there, and a slide whose whole composition depends on it would render
 * as a hard-edged disc on half the devices in the field.
 *
 * So the glow is stacked instead of blurred: concentric circles at low alpha,
 * each larger and fainter than the last. That approximates the falloff a real
 * blur produces, costs nothing, and looks identical on both platforms — which
 * matters more here than matching the technique exactly.
 */

/**
 * Rings, largest to smallest, each at the same low alpha.
 *
 * Four rings at rising opacity was the first attempt and it banded visibly:
 * every step read as an edge, which is the one thing a blur never does. Many
 * rings at a constant low alpha work better because the overlap does the work —
 * coverage at the centre is 1-(1-a)^n and falls off smoothly outward, so the
 * ramp is generated rather than hand-tuned into a staircase.
 */
const RINGS = 12;
const RING_ALPHA = 0.035;
const MAX_SCALE = 2.1;

const HALO = Array.from({ length: RINGS }, (_, index) => ({
  key: index,
  scale: MAX_SCALE * (1 - index / (RINGS + 1))
}));

export function Wash({
  name,
  diameter = 300,
  offsetY = 0,
  style
}: {
  name: WashName;
  /** Nominal blob size. The halo extends well past this. */
  diameter?: number;
  /** Moves the glow up or down behind whatever sits in front of it. */
  offsetY?: number;
  style?: ViewStyle;
}) {
  const colour = blobs[name];

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <LinearGradient
        // Top-left to bottom-right, matching the reference's bg-gradient-to-br.
        colors={washes[name]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.halo, { top: offsetY }]}>
        {HALO.map((ring) => (
          <View
            key={ring.key}
            style={{
              position: "absolute",
              width: diameter * ring.scale,
              height: diameter * ring.scale,
              borderRadius: (diameter * ring.scale) / 2,
              backgroundColor: colour,
              opacity: RING_ALPHA
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center"
  }
});
