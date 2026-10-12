import { withUnistyles } from "react-native-unistyles";
import { Folder, GitBranch, X } from "lucide-react-native";

import { ICON_SIZE, type Theme } from "@/styles/theme";

const mutedIconProps = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

export const AdditionalRepoFolderIcon = withUnistyles(Folder);
export const AdditionalRepoBranchIcon = withUnistyles(GitBranch);
export const AdditionalRepoRemoveIcon = withUnistyles(X);

export const additionalRepoMutedIconProps = mutedIconProps;
export const ADDITIONAL_REPO_ICON_SIZE = ICON_SIZE.sm;
