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

/** Circle sizes as a fraction of the blob's nominal diameter, largest first. */
const HALO = [
  { scale: 1.9, opacity: 0.1 },
  { scale: 1.5, opacity: 0.14 },
  { scale: 1.15, opacity: 0.18 },
  { scale: 0.85, opacity: 0.22 }
];

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
            key={ring.scale}
            style={{
              position: "absolute",
              width: diameter * ring.scale,
              height: diameter * ring.scale,
              borderRadius: (diameter * ring.scale) / 2,
              backgroundColor: colour,
              opacity: ring.opacity
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
