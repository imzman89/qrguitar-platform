import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
export const colors = {
  background: "#0A0D10",
  surface: "#14191F",
  elevated: "#1C232B",
  border: "#303A45",
  ink: "#F6F3EC",
  muted: "#AEB8C4",
  gold: "#E4B766",
  error: "#FFB2A8",
  success: "#ACDFBC",
};
export function Action({
  title,
  onPress,
  secondary = false,
  disabled = false,
  loading = false,
  compact = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        secondary && styles.secondary,
        compact && styles.compact,
        (pressed || disabled || loading) && styles.dim,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={secondary ? colors.gold : colors.background}
        />
      ) : null}
      <Text style={[styles.actionText, secondary && styles.secondaryText]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  hint,
  error,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#84909D"
        selectionColor={colors.gold}
        {...props}
        style={[
          styles.input,
          props.multiline && styles.multiline,
          props.editable === false && styles.dim,
          props.style,
        ]}
      />
      {hint ? <Text style={styles.small}>{hint}</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
export function Notice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return (
    <View
      accessibilityRole={error ? "alert" : "text"}
      style={[styles.notice, error && styles.errorBox]}
    >
      <Text style={error ? styles.error : styles.copy}>{message}</Text>
    </View>
  );
}
export function Heading({
  title,
  eyebrow,
  copy,
}: {
  title: string;
  eyebrow?: string;
  copy?: string;
}) {
  return (
    <View style={styles.heading}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {copy ? <Text style={styles.copy}>{copy}</Text> : null}
    </View>
  );
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
    padding: 20,
    gap: 20,
    paddingBottom: 32,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  heading: { gap: 10, paddingTop: 8 },
  eyebrow: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  h2: { color: colors.ink, fontSize: 21, lineHeight: 28, fontWeight: "700" },
  copy: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  small: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  action: {
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.gold,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  actionText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
    color: colors.background,
    textAlign: "center",
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.ink },
  compact: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10 },
  dim: { opacity: 0.55 },
  field: { gap: 8 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  input: {
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 23,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 52,
  },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  error: { color: colors.error, fontSize: 14, lineHeight: 21 },
  notice: {
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  errorBox: { borderColor: "#6A3E3B" },
  pill: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "700",
    borderColor: "#594A33",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: "hidden",
  },
  divider: { height: 1, backgroundColor: colors.border },
  empty: { alignItems: "center", paddingVertical: 28, gap: 14 },
  center: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: 24,
    gap: 16,
  },
});
