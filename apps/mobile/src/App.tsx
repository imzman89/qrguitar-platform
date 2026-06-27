import { sampleGuitar } from "@qrguitar/shared";
import { StatusBar } from "expo-status-bar";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.brand}>QRguitar</Text>
            <Text style={styles.muted}>MVP mobile app</Text>
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.badge}>Verified</Text>
            <Text style={styles.title}>{sampleGuitar.name}</Text>
            <Text style={styles.copy}>{sampleGuitar.summary}</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.primary}>
              <Text style={styles.primaryText}>Scan QR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary}>
              <Text style={styles.secondaryText}>Register Guitar</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Instrument details</Text>
          {sampleGuitar.specs.map((spec) => (
            <View style={styles.row} key={spec.label}>
              <Text style={styles.rowLabel}>{spec.label}</Text>
              <Text style={styles.rowValue}>{spec.value}</Text>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Timeline</Text>
          {sampleGuitar.timeline.map((event) => (
            <View style={styles.card} key={event.id}>
              <Text style={styles.badge}>{event.date}</Text>
              <Text style={styles.cardTitle}>{event.title}</Text>
              <Text style={styles.copy}>{event.description}</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#070c10"
  },
  container: {
    padding: 20,
    gap: 18
  },
  header: {
    paddingVertical: 10
  },
  brand: {
    color: "#c89a45",
    fontSize: 30,
    fontWeight: "900"
  },
  muted: {
    color: "rgba(248,246,242,.68)"
  },
  heroCard: {
    minHeight: 360,
    justifyContent: "flex-end",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(248,246,242,.14)",
    padding: 22,
    backgroundColor: "#11191e"
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(200,154,69,.46)",
    color: "#c89a45",
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: "hidden",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  title: {
    marginTop: 14,
    color: "#f8f6f2",
    fontSize: 44,
    fontWeight: "900",
    lineHeight: 46
  },
  copy: {
    marginTop: 10,
    color: "rgba(248,246,242,.72)",
    fontSize: 15,
    lineHeight: 22
  },
  actions: {
    gap: 12
  },
  primary: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f0df"
  },
  primaryText: {
    color: "#071014",
    fontWeight: "900"
  },
  secondary: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(248,246,242,.14)",
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryText: {
    color: "#f8f6f2",
    fontWeight: "900"
  },
  sectionTitle: {
    marginTop: 16,
    color: "#f8f6f2",
    fontSize: 22,
    fontWeight: "900"
  },
  row: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(248,246,242,.14)",
    padding: 16,
    backgroundColor: "#11191e"
  },
  rowLabel: {
    color: "rgba(248,246,242,.6)",
    fontSize: 12,
    textTransform: "uppercase"
  },
  rowValue: {
    color: "#f8f6f2",
    fontSize: 16,
    fontWeight: "800"
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(248,246,242,.14)",
    padding: 18,
    backgroundColor: "#11191e"
  },
  cardTitle: {
    marginTop: 12,
    color: "#f8f6f2",
    fontSize: 20,
    fontWeight: "900"
  }
});
