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
    <div className='flex flex-col gap-4'>
      <h1 className='text-2xl font-semibold'>Settings</h1>
      <Tabs>
        <TabsList
          aria-label='Settings'
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
          <TabsContent className='rounded-md focus-ring' key={`${it.slug}-content`} value={it.slug}>
            <it.Component />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
