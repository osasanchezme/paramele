import React, { useEffect, useSyncExternalStore } from "react";
import {
  Box,
  Button,
  CloseButton,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  HStack,
  Heading,
  Icon,
  Image,
  Link,
  Stack,
  Tag,
  TagLabel,
  TagLeftIcon,
  Text,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import { MdAutoAwesome, MdBuild, MdOpenInNew, MdTrendingUp, MdWarning } from "react-icons/md";
import utils from "../utils";
import releases from "../js/releases";
import lastSeenVersion from "../js/lastSeenVersion";

const localGetCopy = (copy_key) => utils.getDisplayCopy("releases", copy_key);
const TOAST_ID = "whats-new";
const TOAST_STORAGE_KEY = "paramele_whats_new_toast";
// Wait for the startup model to show before telling the user about the update
const TOAST_DELAY = 2000;

// Each type of change has a fixed color and icon, the same on the site's timeline. Never color alone: the label is always shown
const ENTRY_STYLES = {
  feature: { icon: MdAutoAwesome, colorScheme: "brand" },
  improvement: { icon: MdTrendingUp, colorScheme: "blue" },
  fix: { icon: MdBuild, colorScheme: "gray" },
  critical: { icon: MdWarning, colorScheme: "red" },
};

// The drawer is opened from the badge, Settings > About and the update toast. It keeps the version the user had seen when it
// opened (opening it marks the running one as seen)
let drawer = { is_open: false, since: null };
let drawer_listeners = new Set();
function setDrawer(value) {
  drawer = value;
  drawer_listeners.forEach((listener) => listener());
}
function subscribeToDrawer(listener) {
  drawer_listeners.add(listener);
  return () => drawer_listeners.delete(listener);
}

function openWhatsNew() {
  if (drawer.is_open) return;
  setDrawer({ is_open: true, since: lastSeenVersion.getSnapshot().version });
  releases.markCurrentVersionSeen();
}

function closeWhatsNew() {
  setDrawer({ ...drawer, is_open: false });
}

function readToastVersion() {
  try {
    return window.localStorage.getItem(TOAST_STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

function writeToastVersion(version) {
  try {
    window.localStorage.setItem(TOAST_STORAGE_KEY, version);
  } catch (error) {
    // Storage blocked: the toast may show again on the next visit
  }
}

/**
 * Type of a change, with its icon and label
 * @param {{entry: import("../js/types").ParamEleReleaseEntry}} props
 */
function EntryTypeTag({ entry }) {
  let style_key = releases.isCritical(entry) ? "critical" : entry.type;
  let { icon, colorScheme } = ENTRY_STYLES[style_key];
  return (
    <Tag size="sm" colorScheme={colorScheme} variant="subtle" alignSelf="flex-start">
      <TagLeftIcon as={icon} boxSize="12px" />
      <TagLabel>{localGetCopy(`type_${style_key}`)}</TagLabel>
    </Tag>
  );
}

/**
 * "4 new · 6 improved · 3 fixed (1 critical)"
 * @param {{counts: import("../js/types").ParamEleReleaseCounts}} props
 */
function ReleaseCounts({ counts }) {
  let parts = releases.getCountParts(counts, localGetCopy);
  return (
    <Text fontSize="xs" color="gray.600">
      {parts.map((part, index) => (
        <React.Fragment key={part.type}>
          {index > 0 && " · "}
          <Text as="span" color={part.type === "critical" ? "red.600" : undefined} fontWeight={part.type === "critical" ? "semibold" : undefined}>
            {part.text}
          </Text>
        </React.Fragment>
      ))}
    </Text>
  );
}

/**
 * @param {{entry: import("../js/types").ParamEleReleaseEntry}} props
 */
function ReleaseEntry({ entry }) {
  let description = releases.localize(entry.description);
  return (
    <Box as="li" listStyleType="none" borderWidth="1px" borderColor={releases.isCritical(entry) ? "red.200" : "gray.200"} borderRadius="md" p={3}>
      <Stack spacing={2}>
        <EntryTypeTag entry={entry} />
        <Text fontWeight="semibold" lineHeight="short">
          {releases.localize(entry.title)}
        </Text>
        {description && (
          <Box className="release-entry-description" fontSize="sm" color="gray.700" dangerouslySetInnerHTML={{ __html: description }} />
        )}
        {entry.media && <Image src={entry.media} alt="" loading="lazy" borderRadius="md" borderWidth="1px" borderColor="gray.200" />}
        {entry.links.length > 0 && (
          <HStack spacing={3} wrap="wrap">
            {entry.links.map((link) => (
              <Link key={link} href={link} isExternal color="brand.600" fontSize="sm">
                {localGetCopy("learn_more")} <Icon as={MdOpenInNew} mx="2px" />
              </Link>
            ))}
          </HStack>
        )}
      </Stack>
    </Box>
  );
}

/**
 * Side drawer with the highlights and critical fixes since the last version the user saw.
 * Opening it marks the running version as seen, so it is never offered twice for the same version
 */
function WhatsNewDrawer() {
  let { is_open, since } = useSyncExternalStore(subscribeToDrawer, () => drawer);
  if (!is_open) return null;
  let has_newer = since && releases.isNewVersion(since);
  let { groups, releases: shown_releases } = releases.getWhatsNew(has_newer ? since : null);
  let total_entries = shown_releases.reduce((total, release) => total + release.entries.length, 0);
  let shown_entries = groups.reduce((total, group) => total + group.entries.length, 0);
  let more_entries = total_entries - shown_entries;
  return (
    <Drawer isOpen={is_open} placement="right" size="sm" onClose={closeWhatsNew}>
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px">
          <Text>{localGetCopy("drawer_title")}</Text>
          <Text fontSize="sm" fontWeight="normal" color="gray.600">
            {has_newer ? localGetCopy("drawer_since").replace("{v}", since) : localGetCopy("drawer_current")}
          </Text>
        </DrawerHeader>
        <DrawerBody>
          <Stack spacing={6} py={2}>
            {groups.map(({ release, entries }) => (
              <Box as="section" key={release.version} aria-labelledby={`whats-new-${release.version}`}>
                <Heading as="h3" size="sm" id={`whats-new-${release.version}`}>
                  {localGetCopy("version_label").replace("{v}", release.version)}
                  {release.title && ` · ${releases.localize(release.title)}`}
                </Heading>
                <Text fontSize="xs" color="gray.600" mb={1}>
                  {releases.formatDate(release.date)}
                </Text>
                <Text fontSize="sm" mb={1}>
                  {releases.localize(release.summary)}
                </Text>
                <ReleaseCounts counts={release.counts} />
                <Stack as="ul" spacing={3} mt={3} ml={0}>
                  {entries.map((entry) => (
                    <ReleaseEntry entry={entry} key={entry.id} />
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </DrawerBody>
        <DrawerFooter borderTopWidth="1px" flexDirection="column" alignItems="stretch" gap={2}>
          {more_entries > 0 && (
            <Text fontSize="sm" color="gray.600">
              {localGetCopy(more_entries === 1 ? "more_changes_one" : "more_changes").replace("{n}", more_entries)}
            </Text>
          )}
          <Button
            as="a"
            href={releases.getTimelineURL({ seen: has_newer ? since : null })}
            target="_blank"
            rel="noopener"
            colorScheme="brand"
            rightIcon={<Icon as={MdOpenInNew} />}
          >
            {localGetCopy("full_timeline")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Tells the user once per version that the app was updated, with a link to What's new. Closing the toast counts as dismissing
 * the notes; when it hides by itself the badge keeps its dot until the user opens What's new
 */
function useUpdateToast() {
  let toast = useToast();
  let { version: last_seen, is_ready } = useSyncExternalStore(lastSeenVersion.subscribe, lastSeenVersion.getSnapshot);
  useEffect(() => {
    if (!is_ready || !releases.isNewVersion(last_seen) || readToastVersion() === releases.APP_VERSION) return;
    let timeout = setTimeout(() => {
      if (toast.isActive(TOAST_ID)) return;
      writeToastVersion(releases.APP_VERSION);
      let title = localGetCopy(last_seen ? "toast_updated_title" : "toast_welcome_title").replace("{v}", releases.APP_VERSION);
      toast({
        id: TOAST_ID,
        position: "bottom-right",
        duration: 12000,
        // Above the status bar, so the version badge stays visible
        containerStyle: { marginBottom: "32px" },
        render: ({ onClose }) => (
          <HStack bg="white" boxShadow="lg" borderRadius="md" borderWidth="1px" borderColor="gray.200" p={3} spacing={3} align="center" role="status">
            <Icon as={MdAutoAwesome} color="brand.600" boxSize={5} />
            <Box flex="1">
              <Text fontWeight="semibold" fontSize="sm">
                {title}
              </Text>
              <Button
                variant="link"
                colorScheme="brand"
                size="sm"
                onClick={() => {
                  onClose();
                  openWhatsNew();
                }}
              >
                {localGetCopy("toast_action")}
              </Button>
            </Box>
            <CloseButton
              size="sm"
              aria-label={localGetCopy("dismiss")}
              onClick={() => {
                releases.markCurrentVersionSeen();
                onClose();
              }}
            />
          </HStack>
        ),
      });
    }, TOAST_DELAY);
    return () => clearTimeout(timeout);
  }, [is_ready, last_seen, toast]);
}

function WhatsNew() {
  useUpdateToast();
  return <WhatsNewDrawer />;
}

/**
 * "v1.4.2" in the status bar, with a dot while there is a version the user has not seen. It opens What's new
 */
function VersionBadge() {
  let { version: last_seen, is_ready } = useSyncExternalStore(lastSeenVersion.subscribe, lastSeenVersion.getSnapshot);
  let has_news = is_ready && releases.isNewVersion(last_seen);
  let label = localGetCopy(has_news ? "badge_tooltip_new" : "badge_tooltip");
  return (
    <Tooltip label={label} placement="top-end" openDelay={300}>
      <button
        type="button"
        className="version-badge"
        aria-label={`${localGetCopy("version_label").replace("{v}", releases.APP_VERSION)}. ${label}`}
        onClick={openWhatsNew}
      >
        v{releases.APP_VERSION}
        {has_news && <span className="version-badge-dot" aria-hidden="true"></span>}
      </button>
    </Tooltip>
  );
}

/**
 * Settings > About: the version, its build date and links to the release notes
 * @param {{onOpenWhatsNew: function(): void}} props
 */
function AboutPanel({ onOpenWhatsNew }) {
  let release = releases.getCurrentRelease();
  return (
    <Stack spacing={4}>
      <Box>
        <Heading as="h3" size="md">
          {localGetCopy("version_label").replace("{v}", releases.APP_VERSION)}
          {release && release.title && ` · ${releases.localize(release.title)}`}
        </Heading>
        <Text fontSize="sm" color="gray.600">
          {release && `${localGetCopy("released_on").replace("{date}", releases.formatDate(release.date))} · `}
          {localGetCopy("built_on").replace("{date}", releases.formatDate(releases.BUILD_DATE))}
        </Text>
      </Box>
      {release && (
        <Box>
          <Text mb={1}>{releases.localize(release.summary)}</Text>
          <ReleaseCounts counts={release.counts} />
        </Box>
      )}
      <HStack spacing={3} wrap="wrap">
        <Button colorScheme="brand" leftIcon={<Icon as={MdAutoAwesome} />} onClick={onOpenWhatsNew}>
          {localGetCopy("drawer_title")}
        </Button>
        <Button
          as="a"
          href={releases.getTimelineURL({ seen: lastSeenVersion.getSnapshot().version })}
          target="_blank"
          rel="noopener"
          variant="outline"
          rightIcon={<Icon as={MdOpenInNew} />}
        >
          {localGetCopy("full_timeline")}
        </Button>
      </HStack>
      <Link href="https://github.com/osasanchezme/paramele" isExternal color="brand.600" fontSize="sm">
        {localGetCopy("source_code")} <Icon as={MdOpenInNew} mx="2px" />
      </Link>
    </Stack>
  );
}

export default WhatsNew;
export { VersionBadge, AboutPanel, EntryTypeTag, openWhatsNew };
