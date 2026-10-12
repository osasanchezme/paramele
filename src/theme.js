import { extendTheme } from "@chakra-ui/react";
import { tagTheme } from "./components/custom_variants/tag";
import { accordionTheme } from "./components/custom_variants/accordion";

// Brand palette (ParamEle styleguide). Olive (500) is a fill, never text on light: text on it is ink.
// Olive text and links on light use olive-deep (600), with olive-deeper (700) on hover.
// The named tokens are the styleguide colours as given.
const brand = {
  50: "#F6F7EC",
  100: "#ECEED6",
  200: "#C5CC98",
  300: "#ADB86A",
  400: "#9AA94C",
  500: "#8C9C3A",
  600: "#4F5A1C",
  700: "#3D4518",
  800: "#2E3412",
  900: "#1D2014",
  ink: "#1D2014",
  olive: "#8C9C3A",
  olive_deep: "#4F5A1C",
  olive_deeper: "#3D4518",
  sage: "#C5CC98",
  cream: "#F3F0E3",
  paper: "#FAF8F1",
  sand: "#ECE8DA",
  line: "#E2DECF",
  night: "#1A1C16",
};

// Warm neutrals from the styleguide (paper, sand, line, ink-muted, ink-soft, ink), replacing Chakra's blue-tinted grays.
// 500 is the lightest gray that still passes WCAG AA as text on white.
const gray = {
  50: "#FAF8F1",
  100: "#ECE8DA",
  200: "#E2DECF",
  300: "#CFCBBA",
  400: "#A09F8C",
  500: "#727465",
  600: "#5F6152",
  700: "#3F4234",
  800: "#2A2E1E",
  900: "#1D2014",
};

// Chakra defaults these to blue: the focus border of fields and the colorScheme of selection controls
const brand_focus = { defaultProps: { focusBorderColor: "brand.500" } };
const brand_scheme = { defaultProps: { colorScheme: "brand" } };

const theme = extendTheme({
  colors: { brand, gray },
  // Focus ring of buttons, checkboxes, menu items... (Chakra's is rgba(66, 153, 225, 0.6))
  shadows: { outline: "0 0 0 3px rgba(140, 156, 58, 0.5)" },
  components: {
    Tag: tagTheme,
    Accordion: accordionTheme,
    Button: {
      variants: {
        // Chakra puts white text on the 500 fill and darkens to 600/700; olive takes ink text and a slightly darker olive
        solid: (props) =>
          props.colorScheme === "brand"
            ? { bg: "brand.500", color: "brand.ink", _hover: { bg: "#859437", _disabled: { bg: "brand.500" } }, _active: { bg: "#7E8D33" } }
            : {},
        link: (props) => (props.colorScheme === "brand" ? { color: "brand.600", _hover: { color: "brand.700" }, _active: { color: "brand.700" } } : {}),
      },
    },
    Checkbox: { ...brand_scheme, baseStyle: { control: { _checked: { color: "brand.ink" } } } },
    Input: brand_focus,
    NumberInput: brand_focus,
    Textarea: brand_focus,
    Select: brand_focus,
    Slider: brand_scheme,
    Tabs: brand_scheme,
  },
});

export default theme;
