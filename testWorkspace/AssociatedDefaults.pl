our @default_files = ("*.tex");
our $out_dir = "";
our $show_time = 0;

sub add_cus_dep {
    my ($from_ext, $to_ext, $must, $sub_name) = @_;
    return [$from_ext, $to_ext, $must, $sub_name];
}
