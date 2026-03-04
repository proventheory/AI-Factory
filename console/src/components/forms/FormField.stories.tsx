import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useForm, FormProvider } from "react-hook-form";
import { FormInput, FormSelect, FormTextarea, FormCheckbox, FormSwitch, FormActions } from "./FormField";
import { Button } from "@/components/ui";

function FormWrapper({ children }: { children: React.ReactNode }) {
  const methods = useForm({ defaultValues: { name: "", type: "", description: "", enabled: false, agree: false } });
  return <FormProvider {...methods}><form className="space-y-4 max-w-md">{children}</form></FormProvider>;
}

const meta = {
  title: "Forms/FormField",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllFields: Story = {
  render: () => (
    <FormWrapper>
      <FormInput name="name" label="Name" placeholder="Enter name" required />
      <FormSelect name="type" label="Type" options={[{ value: "a", label: "Option A" }, { value: "b", label: "Option B" }]} placeholder="Select..." required />
      <FormTextarea name="description" label="Description" placeholder="Describe..." />
      <FormCheckbox name="agree" label="I agree to the terms" description="Required to proceed" />
      <FormSwitch name="enabled" label="Enable feature" description="Toggle this on to activate" />
      <FormActions><Button type="submit">Submit</Button><Button type="button" variant="secondary">Cancel</Button></FormActions>
    </FormWrapper>
  ),
};
