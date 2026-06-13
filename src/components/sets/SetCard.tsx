import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { FlashcardSet } from "@/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Props {
  set: FlashcardSet;
  onRename: () => void;
  onDelete: () => void;
  onOpen: () => void;
}

export function SetCard({ set, onRename, onDelete, onOpen }: Props) {
  return (
    <Card
      className={cn("cursor-pointer border-white/10 bg-white/5 backdrop-blur-xl transition-colors hover:bg-white/10")}
    >
      <CardHeader>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-blue-100/50 hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onRename();
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
        <button type="button" onClick={onOpen} className="text-left">
          <CardTitle className="text-white">{set.name}</CardTitle>
        </button>
        <CardDescription className="text-blue-100/50">&mdash; cards</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-blue-100/40">
        <p>
          Created{" "}
          {new Date(set.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </CardContent>
      <CardFooter className="text-xs text-blue-100/30">
        {set.last_opened_at
          ? `Last opened ${new Date(set.last_opened_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}`
          : "Not opened yet"}
      </CardFooter>
    </Card>
  );
}
