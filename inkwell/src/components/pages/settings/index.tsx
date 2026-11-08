import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Profile } from "./Profile";
import { Tokens } from "./Tokens";

const PAGES = [
  {
    slug: "profile",
    label: "Profile",
    Component: Profile,
  },
  {
    slug: "tokens",
    label: "Extension tokens",
    Component: Tokens,
  },
];

export const Settings = () => {
  return (
    <Tabs>
      <TabsList
        variant='line'
        className='h-auto! max-w-full flex-wrap justify-start'
      >
        {PAGES.map((it) => (
          <TabsTrigger key={it.slug} value={it.slug} nativeButton={false}>
            {it.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {PAGES.map((it) => (
        <TabsContent key={`${it.slug}-content`} value={it.slug}>
          <it.Component />
        </TabsContent>
      ))}
    </Tabs>
  );
};
