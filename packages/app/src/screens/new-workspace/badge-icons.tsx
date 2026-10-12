import { withUnistyles } from "react-native-unistyles";
import { Folder, GitBranch, GitPullRequest } from "lucide-react-native";

import { ICON_SIZE, type Theme } from "@/styles/theme";

const badgeMutedIconProps = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

export const NewWorkspaceBadgeFolderIcon = withUnistyles(Folder);
export const NewWorkspaceBadgeGitBranchIcon = withUnistyles(GitBranch);
export const NewWorkspaceBadgeGitPullRequestIcon = withUnistyles(GitPullRequest);

export const newWorkspaceBadgeMutedIconProps = badgeMutedIconProps;
export const newWorkspaceBadgeIconSize = ICON_SIZE.sm;
