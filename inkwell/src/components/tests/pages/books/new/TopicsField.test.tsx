import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TopicsField } from "@/components/pages/books/new/TopicsField";
import type { TopicLists } from "@/types/shelf.type";
import { expectAccessible } from "../../../a11y";

const topics: TopicLists = {
  genres: ["Fantasy", "Thriller"],
  tropes: [
    { name: "Chosen One", genres: ["Fantasy"] },
    { name: "Unreliable Narrator", genres: ["Thriller"] },
  ],
};
const sent = () => new FormData(document.querySelector("form") as HTMLFormElement);
const show = (props: Partial<Parameters<typeof TopicsField>[0]> = {}) =>
  render(
    <form>
      <TopicsField topics={topics} {...props} />
    </form>,
  );
const options = async (picker: string) => {
  await userEvent.click(screen.getByRole("combobox", { name: picker }));
  return (await screen.findAllByRole("option")).map((option) => option.textContent);
};

describe("TopicsField", () => {
  it("starts from the reader's genre, trope and tags", async () => {
    show({ genre: "Fantasy", trope: "Chosen One", tags: ["fae", "court"] });
    expect(sent().get("genre")).toBe("Fantasy");
    expect(sent().get("trope")).toBe("Chosen One");
    expect(sent().get("tags")).toBe("fae, court");
    await expectAccessible();
  });

  it("sends nothing for no genre or trope", () => {
    show();
    expect(sent().get("genre")).toBe("");
    expect(sent().get("trope")).toBe("");
  });

  it("offers None and every genre", async () => {
    show();
    expect(await options("Genre")).toEqual(["None", "Fantasy", "Thriller"]);
    await expectAccessible();
  });

  it("picks a genre", async () => {
    show();
    await options("Genre");
    await userEvent.click(screen.getByRole("option", { name: "Thriller" }));
    expect(sent().get("genre")).toBe("Thriller");
  });

  it("narrows the tropes to the genre's", async () => {
    show({ genre: "Fantasy" });
    expect(await options("Trope")).toEqual(["None", "Chosen One"]);
  });

  it("shows every trope without a genre, or when asked", async () => {
    show({ genre: "Fantasy" });
    await userEvent.click(screen.getByRole("checkbox", { name: /Show all tropes/ }));
    expect(await options("Trope")).toEqual(["None", "Chosen One", "Unreliable Narrator"]);
  });

  it("keeps a chosen trope from another genre listed", async () => {
    show({ genre: "Fantasy", trope: "Unreliable Narrator" });
    expect(await options("Trope")).toEqual(["None", "Chosen One", "Unreliable Narrator"]);
  });

  it("only offers all tropes once a genre is chosen", () => {
    show();
    expect(screen.queryByRole("checkbox", { name: /Show all tropes/ })).toBeNull();
  });
});
